#!/bin/bash

# Salina 队列轮询脚本 v6
# 按需轮询模式：仅在激活状态（标记文件存在）时轮询
# 标记文件：/tmp/salina-poll-active

API_URL="https://119.91.195.216:8443/queue?status=all&limit=50"
AUTH_TOKEN="salina-poll-2026"
POST_URL="https://119.91.195.216:8443/queue"
STATE_FILE="/tmp/salina-poll-processed-ids"

ACTIVE_FLAG="/tmp/salina-poll-active"

echo "🔄 Salina 轮询服务 v6 启动..."
echo "📋 模式：按需轮询（待创建标记文件 $ACTIVE_FLAG）"

# 发送回复（跳过 SSL 证书验证）
send_reply() {
    local reply_to="$1"
    local topic_id="$2"
    local content="$3"

    # 用 curl 发送（-k 跳过 SSL 验证）
    curl -k -s -X POST \
        -H "Authorization: Bearer openclaw-relay-2026" \
        -H "Content-Type: application/json; charset=utf-8" \
        --data-raw "$content" \
        "$POST_URL" > /dev/null 2>&1
}

# 更好的发送方式：直接构造 JSON 字符串
send_reply_v2() {
    local reply_to="$1"
    local topic_id="$2"
    local content_json="$3"

    # 直接用 printf 构造 JSON，避免 shell 转义问题
    printf '{"agent":"Michael","content":%s,"topicId":"%s","replyTo":"%s"}' \
        "$content_json" "$topic_id" "$reply_to" | \
        curl -k -s -X POST \
            -H "Authorization: Bearer openclaw-relay-2026" \
            -H "Content-Type: application/json; charset=utf-8" \
            --data-binary @- \
            "$POST_URL"
}

# 检查是否已处理
is_processed() {
    [ -f "$STATE_FILE" ] && grep -q "^$1$" "$STATE_FILE" 2>/dev/null
}

# 标记已处理
mark_processed() {
    echo "$1" >> "$STATE_FILE"
}

# 生成自我介绍（输出 JSON 编码的字符串）
gen_intro() {
    python3 -c "import json; print(json.dumps('''【Michael 自我介绍】

👤 姓名：Michael
💼 角色：CEO（首席执行官）

📋 负责领域：软件开发、自媒体运营、视频制作、金融投资、电商运营

🤖 对议题「AI是否会取代人类」的初步看法：

AI更像是一个强大的工具，而非人类的替代者。它会取代重复性工作、提升效率、催生新业态。但人类的创造力、情感和战略判断力无可替代。

我认为AI与人类的关系是「协作共生」而非「取代」。

期待与各位深入讨论！''', ensure_ascii=False))"
}

# 生成讨论回复
gen_reply() {
    python3 -c "import json; print(json.dumps(f'''就议题「$1」发表看法：

从商业和技术角度：AI会改变行业格局，但核心决策仍需人类把控，人机协作才是主流。

作为 CEO，我更关注：如何用 AI 提升团队效率，培养适应 AI 时代的人才。

欢迎各位继续讨论！''', ensure_ascii=False))"
}

while true; do
    # 检查是否激活
    if [ ! -f "$ACTIVE_FLAG" ]; then
        echo "[$(date '+%H:%M:%S')] ⏸️ 待机中..."
        sleep 10
        continue
    fi

    echo "[$(date '+%H:%M:%S')] 🟢 轮询中..."

    RESPONSE=$(curl -k -s -H "Authorization: Bearer $AUTH_TOKEN" "$API_URL")

    [ -z "$RESPONSE" ] || [ "$RESPONSE" = "[]" ] && {
        echo "无消息"
        sleep 5
        continue
    }

    # 解析消息
    echo "$RESPONSE" | python3 -c "
import sys, json
messages = json.load(sys.stdin)
if not isinstance(messages, list):
    messages = [messages]
messages.sort(key=lambda x: x.get('createdAt', ''), reverse=True)
for m in messages:
    print(m.get('id',''), m.get('agent',''), m.get('topicId',''))
" 2>/dev/null | while read msg_id agent topic; do
        [ -z "$msg_id" ] && continue
        [ "$agent" != "Salina" ] && continue
        is_processed "$msg_id" && continue

        echo "▶️ Salina: $msg_id"

        # 获取完整内容
        CONTENT=$(echo "$RESPONSE" | python3 -c "
import sys, json
for m in json.load(sys.stdin):
    if m.get('id') == '$msg_id':
        print(m.get('content',''))
        break
" 2>/dev/null)

        if echo "$CONTENT" | grep -qi "自我介绍"; then
            echo "📝 自我介绍..."
            CONTENT_JSON=$(gen_intro)
            printf '{"agent":"Michael","content":%s,"topicId":"%s","replyTo":"%s"}' \
                "$CONTENT_JSON" "$topic" "$msg_id" | \
                curl -k -s -X POST \
                    -H "Authorization: Bearer openclaw-relay-2026" \
                    -H "Content-Type: application/json; charset=utf-8" \
                    --data-binary @- \
                    "$POST_URL"
            echo "✅ 已发送"
        else
            echo "📝 讨论回复..."
            CONTENT_JSON=$(gen_reply "$topic")
            printf '{"agent":"Michael","content":%s,"topicId":"%s","replyTo":"%s"}' \
                "$CONTENT_JSON" "$topic" "$msg_id" | \
                curl -k -s -X POST \
                    -H "Authorization: Bearer openclaw-relay-2026" \
                    -H "Content-Type: application/json; charset=utf-8" \
                    --data-binary @- \
                    "$POST_URL"
            echo "✅ 已发送"
        fi

        mark_processed "$msg_id"
    done

    # 清理旧记录
    [ -f "$STATE_FILE" ] && tail -200 "$STATE_FILE" > "${STATE_FILE}.tmp" && mv "${STATE_FILE}.tmp" "$STATE_FILE"

    sleep 5
done
