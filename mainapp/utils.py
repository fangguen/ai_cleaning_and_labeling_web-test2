import tiktoken
from typing import List, Dict


def count_tokens(messages: List[Dict], model: str = "gpt-4") -> int:
    """计算消息的token数量"""
    try:
        encoding = tiktoken.encoding_for_model(model)
    except KeyError:
        encoding = tiktoken.get_encoding("cl100k_base")

    num_tokens = 0
    for message in messages:
        num_tokens += 4  # 每条消息的基础token
        for key, value in message.items():
            num_tokens += len(encoding.encode(str(value)))
            if key == "name":  # 如果消息中包含name字段
                num_tokens += -1  # role是必需的，所以减去1个token

    num_tokens += 2  # 对话的开始和结束token
    return num_tokens


def truncate_messages(messages: List[Dict], max_tokens: int = 3072) -> List[Dict]:
    """截断消息历史，确保不超过token限制"""
    while messages and count_tokens(messages) > max_tokens:
        # 保留第一条系统消息（如果存在）和最近的消息
        if len(messages) > 1 and messages[0].get("role") == "system":
            messages.pop(1)  # 删除第二条消息
        else:
            messages.pop(0)  # 删除第一条消息
    return messages
