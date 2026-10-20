#!/usr/bin/env python3
# Salina 队列轮询播报脚本
# 每 15 秒轮询一次，收集其他 Agent 的消息并播报到圆桌群

import urllib.request
import urllib.error
import ssl
import json
import time
import os

# 配置
API_URL = "https://119.91.195.216:8443/queue?status=all&limit=500"
AUTH_TOKEN = "salina-poll-2026"
POST_URL = "https://119.91.195.216:8443/queue"
POST_TOKEN = "openclaw-relay-2026"
STATE_FILE = "/tmp/salina-broadcast-ids"

# 圆桌会议群 ID
ROUND_TABLE_CHAT_ID = "oc_70c42b690141952e3022af0713dd3d97"

# 创建 SSL 上下文（跳过证书验证）
ssl_context = ssl.create_default_context()
ssl_context.check_hostname = False
ssl_context.verify_mode = ssl.CERT_NONE

def http_get(url):
    """发送 GET 请求"""
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {AUTH_TOKEN}"})
    try:
        with urllib.request.urlopen(req, context=ssl_context, timeout=10) as response:
            return response.read().decode('utf-8')
    except Exception as e:
        print(f"GET Error: {e}")
        return None

def is_processed(msg_id):
    """检查是否已播报"""
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE, 'r') as f:
            return msg_id in f.read().splitlines()
    return False

def mark_processed(msg_id):
    """标记已播报"""
    with open(STATE_FILE, 'a') as f:
        f.write(msg_id + '\n')

def format_for_broadcast(msg):
    """格式化消息用于播报"""
    agent = msg.get('agent', 'Unknown')
    content = msg.get('content', '')
    topic = msg.get('topicId', '')
    
    text = f"📢 【{agent}】\n{content}"
    if topic:
        text = f"📋 议题：{topic}\n\n{text}"
    
    return text

def send_to_group(chat_id, message):
    """发送消息到飞书群"""
    # TODO: 调用飞书 API 发送消息
    # 这里需要集成飞书 Webhook 或 API
    print(f"  [播报] 发送到群: {message[:100]}...")
    return True

def main():
    print("🎯 Salina 轮询播报服务启动...")
    print(f"轮询间隔: 15秒")
    print(f"目标群: {ROUND_TABLE_CHAT_ID}")
    
    while True:
        timestamp = time.strftime("%H:%M:%S")
        print(f"[{timestamp}] 轮询...")
        
        response = http_get(API_URL)
        
        if not response or response == "[]":
            print("无消息")
            time.sleep(15)
            continue
        
        try:
            messages = json.loads(response)
            if not isinstance(messages, list):
                messages = [messages]
            
            # 按时间排序
            messages.sort(key=lambda x: x.get('createdAt', ''))
            
            # 收集未播报的消息
            new_messages = []
            for msg in messages:
                msg_id = msg.get('id', '')
                agent = msg.get('agent', '')
                
                # 跳过已播报的和 Salina 自己的消息
                if is_processed(msg_id):
                    continue
                if agent == 'Salina':
                    continue
                
                new_messages.append(msg)
            
            # 播报新消息
            if new_messages:
                print(f"发现 {len(new_messages)} 条新消息")
                
                for msg in new_messages:
                    msg_id = msg.get('id', '')
                    agent = msg.get('agent', '')
                    content = msg.get('content', '')
                    
                    print(f"▶️ [{agent}]: {content[:40]}...")
                    
                    # 格式化并播报
                    formatted = format_for_broadcast(msg)
                    send_to_group(ROUND_TABLE_CHAT_ID, formatted)
                    
                    # 标记已播报
                    mark_processed(msg_id)
                    print(f"✅ 已播报: {msg_id}")
        
        except json.JSONDecodeError as e:
            print(f"JSON 解析错误: {e}")
        
        # 清理旧记录（只保留最近500条）
        if os.path.exists(STATE_FILE):
            with open(STATE_FILE, 'r') as f:
                lines = f.readlines()
            if len(lines) > 500:
                with open(STATE_FILE, 'w') as f:
                    f.writelines(lines[-500:])
        
        time.sleep(15)

if __name__ == "__main__":
    main()
