import shlex
import httpx
import asyncio
from nonebot import get_driver, on_command
from nonebot.matcher import Matcher
from nonebot.adapters.onebot.v11 import Bot, Event, Message
from nonebot.params import CommandArg
from nonebot.plugin import PluginMetadata

__plugin_meta__ = PluginMetadata(
    name="用户反馈与建议",
    description="一个用于收集用户反馈和建议，并展示在网页上的插件",
    usage="""
    反馈 [内容]
    建议 [内容]
    投信 [内容]
    """,
)

# --- 配置加载与检查 ---
# 从 .env.* 文件中读取插件所需的配置项。
driver = get_driver()
config = driver.config

CF_WORKER_URL = getattr(config, "cf_worker_url", None)
CF_API_TOKEN = getattr(config, "cf_api_token", None)
# 前端页面的 URL，用于在回复中引导用户查看。
# 默认指向一个占位符，请务必在配置中修改。
NEKOINBOX_FRONTEND_URL = getattr(config, "nekoinbox_frontend_url", "https://your-pages-project.pages.dev")

@driver.on_startup
async def check_config():
    """在 Bot 启动时检查关键配置是否缺失。"""
    if not CF_WORKER_URL or not CF_API_TOKEN:
        print(
            "\n[NekoInbox] 关键配置缺失！请检查你的 .env 文件并确保已设置 "
            "`CF_WORKER_URL` 和 `CF_API_TOKEN`。\n"
        )

# --- 全局 HTTP 客户端 ---
# 使用 httpx 创建一个全局异步客户端，并设置合理的超时。
async_client = httpx.AsyncClient(timeout=15.0)

# --- 命令响应器 ---
# 定义三个命令，分别处理用户的反馈、建议和投信。
# 优先级设为 10，block=True 表示同一时间只处理一个命令，防止混淆。
feedback_matcher = on_command("反馈", priority=10, block=True)
suggestion_matcher = on_command("建议", priority=10, block=True)
submission_matcher = on_command("投信", priority=10, block=True)


async def process_message(matcher: Matcher, bot: Bot, event: Event, args: Message, msg_type: str):
    """
    一个通用的消息处理“流水线”。

    无论是反馈、建议还是投信，都通过此函数处理。
    它负责解析消息、通知管理员、上传到 Cloudflare，并向用户发送确认。
    """
    # 检查配置是否齐全，如果缺失则提前终止并提示用户。
    if not CF_WORKER_URL or not CF_API_TOKEN:
        await matcher.finish("喵喵信箱的后端服务好像还没配置好，请联系管理员哦~")

    user_id = event.get_user_id()
    user_name = event.sender.card or event.sender.nickname or user_id
    text_content = args.extract_plain_text().strip()

    # 根据消息类型，准备不同的文案。
    type_map = {
        "feedback": "反馈",
        "suggestion": "建议",
        "message": "信件",
    }
    type_name = type_map.get(msg_type, "消息")
    
    # 防止提交空内容。
    if not text_content:
        await matcher.finish(f"{type_name}内容不能为空哦~")

    # 向管理员（Superusers）发送私聊通知。
    if bot.config.superusers:
        message_to_admin = f"📬 [NekoInbox] 收到来自 {user_name}({user_id}) 的新{type_name}：\n{text_content}"
        for admin_id in bot.config.superusers:
            try:
                await bot.send_private_msg(user_id=int(admin_id), message=message_to_admin)
            except Exception as e:
                print(f"[NekoInbox] 向管理员 {admin_id} 发送通知失败: {e}")
    else:
        print("[NekoInbox] 未配置 SUPERUSERS，无法发送管理员通知。")

    # 将消息上传到 Cloudflare Worker。
    upload_success = await upload_to_cf(msg_type, user_name, user_id, text_content)
    
    # 根据上传结果给用户不同的回复。
    if upload_success:
        reply_to_user = f"你的{type_name}已经送到喵喵信箱啦，感谢你的支持！\n可以在这里查看哦: {NEKOINBOX_FRONTEND_URL}"
    else:
        reply_to_user = "抱歉，信息发送失败了，请稍后再试或联系管理员~"
        
    await matcher.send(reply_to_user)
    print(f"[NekoInbox] 收到来自 {user_name}({user_id}) 的{type_name}: {text_content}")


@feedback_matcher.handle()
async def handle_feedback(matcher: Matcher, bot: Bot, event: Event, args: Message = CommandArg()):
    """处理“反馈”命令"""
    await process_message(matcher, bot, event, args, "feedback")


@suggestion_matcher.handle()
async def handle_suggestion(matcher: Matcher, bot: Bot, event: Event, args: Message = CommandArg()):
    """处理“建议”命令"""
    await process_message(matcher, bot, event, args, "suggestion")


@submission_matcher.handle()
async def handle_submission(matcher: Matcher, bot: Bot, event: Event, args: Message = CommandArg()):
    """处理“投信”命令"""
    await process_message(matcher, bot, event, args, "message")


async def upload_to_cf(msg_type: str, user_name: str, user_id: str, content: str) -> bool:
    """
    把整理好的消息打包，通过 HTTP POST 请求发送给 Cloudflare Worker。
    增加了失败重试机制，提高数据上传的成功率。
    """
    api_url = f"{CF_WORKER_URL}/api/messages"
    headers = {"Authorization": f"Bearer {CF_API_TOKEN}"}
    payload = {
        "type": msg_type,
        "user_name": user_name,
        "user_id": user_id,
        "content": content,
    }
    
    # --- 失败重试机制 ---
    max_retries = 3  # 最多试3次
    retry_delay = 5  # 每次隔5秒

    for attempt in range(max_retries):
        try:
            response = await async_client.post(api_url, json=payload, headers=headers)
            response.raise_for_status()  # 如果请求失败(非2xx状态码)，这里会抛出异常
            print(f"成功上传到 Cloudflare: {response.json()}")
            return True  # [FIX] 成功时明确返回 True
        except httpx.HTTPStatusError as e:
            print(f"上传到 Cloudflare 失败 (第 {attempt + 1} 次尝试)，状态码: {e.response.status_code}, 响应: {e.response.text}")
        except Exception as e:
            print(f"上传到 Cloudflare 时发生未知错误 (第 {attempt + 1} 次尝试): {e}")
        
        if attempt < max_retries - 1:
            print(f"将在 {retry_delay} 秒后重试...")
            await asyncio.sleep(retry_delay)
    
    print(f"尝试 {max_retries} 次后，上传到 Cloudflare 最终失败。")
    return False # [FIX] 所有尝试失败后明确返回 False
