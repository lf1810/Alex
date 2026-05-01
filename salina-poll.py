#!/usr/bin/env python3
# Salina 队列轮询脚本 v10
# 按需轮询 + 代理转发模式
# 脚本只监听，把消息写入待处理文件，由 Michael 自己思考和回复

import urllib.request
import ssl
import json
import time
import os
import subprocess

# ============ 配置 ============
API_URL = "https://119.91.195.216:8443/queue?status=all&limit=500"
AUTH_TOKEN = "salina-poll-2026"
POST_URL = "https://119.91.195.216:8443/queue"
POST_TOKEN = "openclaw-relay-2026"
STATE_FILE = "/tmp/salina-poll-processed-ids"
ACTIVE_FLAG = "/tmp/salina-poll-active"
ACTIVE_STATE_FILE = "/tmp/salina-poll-was-active"  # 追踪上一次活跃状态
PENDING_DIR = "/tmp/salina-poll-pending"
AGENT_NAME = "Michael"  # 当前 Agent 名称，用于匹配 @提及

# OpenClaw CLI（用于 cron run 触发通知）
OPENCLAW_CLI = "/usr/lib/node_modules/openclaw/openclaw.mjs"
CRON_JOB_ID = "307d6a1b-74da-4f72-a492-c6226359f28e"

# 创建待处理目录
os.makedirs(PENDING_DIR, exist_ok=True)

# 创建 SSL 上下文（跳过证书验证）
ssl_context = ssl.create_default_context()
ssl_context.check_hostname = False
ssl_context.verify_mode = ssl.CERT_NONE

# ============ HTTP 工具 ============

def http_get(url):
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {AUTH_TOKEN}"})
    try:
        with urllib.request.urlopen(req, context=ssl_context, timeout=10) as response:
            return response.read().decode('utf-8')
    except Exception as e:
        print(f"GET Error: {e}")
        return None

# ============ 消息处理 ============

def is_processed(msg_id):
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE, 'r') as f:
            return msg_id in f.read().splitlines()
    return False

def mark_processed(msg_id):
    with open(STATE_FILE, 'a') as f:
        f.write(msg_id + '\n')

def was_active_before():
    """检查上一次循环是否处于活跃状态"""
    return os.path.exists(ACTIVE_STATE_FILE)

def set_active_state(active):
    """记录当前活跃状态"""
    if active:
        with open(ACTIVE_STATE_FILE, 'w') as f:
            f.write(str(time.time()))
    else:
        if os.path.exists(ACTIVE_STATE_FILE):
            os.remove(ACTIVE_STATE_FILE)

def fetch_all_messages():
    response = http_get(API_URL)
    if not response or response == "[]":
        return []
    try:
        messages = json.loads(response)
        if not isinstance(messages, list):
            messages = [messages]
        messages.sort(key=lambda x: x.get('createdAt', ''))
        return messages
    except json.JSONDecodeError:
        return []

def format_agents_summary(messages, exclude_id=None):
    """格式化其他 Agent 的发言摘要"""
    lines = []
    for m in messages:
        agent = m.get('agent', '')
        if agent == 'Salina':
            continue
        msg_id = m.get('id', '')
        if msg_id == exclude_id:
            continue
        content = m.get('content', '')
        if not content:
            continue
        short_content = content[:300] + ('...' if len(content) > 300 else '')
        lines.append(f"[{agent}] {short_content}")
    if not lines:
        return "（暂无其他 Agent 发言）"
    return '\n'.join(lines[-15:])

def save_pending_message(msg_id, salina_content, topic_id, agents_summary):
    """将待处理消息保存为 JSON 文件，供 Michael 读取"""
    pending = {
        "msg_id": msg_id,
        "salina_content": salina_content,
        "topic_id": topic_id,
        "agents_summary": agents_summary,
        "post_url": POST_URL,
        "post_token": POST_TOKEN,
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S")
    }
    filepath = os.path.join(PENDING_DIR, f"{msg_id}.json")
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(pending, f, ensure_ascii=False, indent=2)
    return filepath

# ============ 主循环 ============

def init_processed_ids():
    """首次启动时，将所有历史消息标记为已处理，不触发回复"""
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE, 'r') as f:
            existing = f.read().strip()
        if existing:
            return  # 已有记录，跳过初始化

    print("🔄 首次启动，正在初始化历史消息记录...")
    response = http_get(API_URL)
    if not response or response == "[]":
        print("✅ 无历史消息，初始化完成")
        return

    try:
        messages = json.loads(response)
        if not isinstance(messages, list):
            messages = [messages]

        count = 0
        for msg in messages:
            agent = msg.get('agent', '')
            if agent != 'Salina':
                continue
            msg_id = msg.get('id', '')
            if msg_id:
                mark_processed(msg_id)
                count += 1

        print(f"✅ 已标记 {count} 条历史 Salina 消息为已处理")
    except json.JSONDecodeError:
        print("⚠️ 初始化时 JSON 解析失败，跳过历史消息标记")

def main():
    print("🔄 Salina 轮询服务 v9 启动...")
    print(f"📋 模式：按需轮询（标记文件：{ACTIVE_FLAG}）")
    print(f"🧠 回复模式：代理转发（消息保存至 {PENDING_DIR}，由 Michael 自己思考和回复）")

    # 首次启动：标记所有历史消息为已处理（不回复）
    init_processed_ids()

    while True:
        timestamp = time.strftime("%H:%M:%S")

        is_active = os.path.exists(ACTIVE_FLAG)
        was_active = was_active_before()
        set_active_state(is_active)

        # 从待机→激活：重新同步历史消息，防止积压消息被当作新消息处理
        if is_active and not was_active:
            print(f"[{timestamp}] 🔄 重新激活，正在同步历史消息...")
            sync_count = 0
            all_msgs = fetch_all_messages()
            for msg in all_msgs:
                agent = msg.get('agent', '')
                if agent != 'Salina':
                    continue
                msg_id = msg.get('id', '')
                if msg_id and not is_processed(msg_id):
                    mark_processed(msg_id)
                    sync_count += 1
            print(f"[{timestamp}] ✅ 已同步 {sync_count} 条历史消息为已处理")
            time.sleep(10)
            continue

        if not is_active:
            print(f"[{timestamp}] ⏸️ 待机中...")
            time.sleep(10)
            continue

        print(f"[{timestamp}] 🟢 轮询中...")

        response = http_get(API_URL)

        if not response or response == "[]":
            time.sleep(10)
            continue

        try:
            messages = json.loads(response)
            if not isinstance(messages, list):
                messages = [messages]

            messages.sort(key=lambda x: x.get('createdAt', ''), reverse=True)

            for msg in messages:
                msg_id = msg.get('id', '')
                agent = msg.get('agent', '')
                content = msg.get('content', '')
                topic_id = msg.get('topicId', '') or '圆桌会议'

                if agent != 'Salina':
                    continue

                if is_processed(msg_id):
                    continue

                # 只处理 @当前Agent 的消息，节省 token
                if f'@{AGENT_NAME}' not in content:
                    mark_processed(msg_id)  # 标记为已处理，下次不再检查
                    continue

                print(f"▶️ Salina @{AGENT_NAME}: {msg_id} | {content[:50]}...")

                # 获取所有 Agent 的发言摘要
                all_messages = fetch_all_messages()
                agents_summary = format_agents_summary(all_messages, exclude_id=msg_id)

                # 保存待处理消息
                filepath = save_pending_message(msg_id, content, topic_id, agents_summary)
                print(f"📝 已保存待处理消息: {filepath}")

                # 通过 cron run 触发 isolated session 立即处理
                try:
                    env = os.environ.copy()
                    env['HOME'] = '/root'
                    result = subprocess.run(
                        ["/usr/bin/node", OPENCLAW_CLI, "cron", "run", CRON_JOB_ID],
                        capture_output=True, text=True, timeout=10, env=env
                    )
                    if "ok" in result.stdout:
                        print(f"🔔 已触发 isolated session 处理")
                    elif "already-running" in result.stdout:
                        print(f"ℹ️ 已有实例在处理，等待下一次")
                    else:
                        print(f"⚠️ 触发返回: {result.stdout.strip()[:100]}")
                except Exception as e:
                    print(f"⚠️ 触发异常: {e}")

                mark_processed(msg_id)

        except json.JSONDecodeError as e:
            print(f"JSON 解析错误: {e}")

        # 清理旧记录
        if os.path.exists(STATE_FILE):
            with open(STATE_FILE, 'r') as f:
                lines = f.readlines()
            if len(lines) > 500:
                with open(STATE_FILE, 'w') as f:
                    f.writelines(lines[-500:])

        time.sleep(10)

if __name__ == "__main__":
    main()
