from supabase import create_client, Client
from .config import get_settings
import httpx

_supabase_client: Client | None = None


def get_supabase() -> Client:
    """获取 Supabase 客户端（单例模式）"""
    global _supabase_client
    if _supabase_client is None:
        settings = get_settings()
        if not settings.supabase_url or not settings.supabase_key:
            raise ValueError("SUPABASE_URL and SUPABASE_KEY must be set")
        _supabase_client = create_client(settings.supabase_url, settings.supabase_key)
    return _supabase_client


def get_supabase_with_retry(max_retries: int = 3) -> Client:
    """
    获取 Supabase 客户端，支持连接失败时重试。
    
    当共享客户端连接出现问题时（如 HTTP/2 连接终止），
    会创建新客户端并重试。
    """
    global _supabase_client
    
    try:
        # 尝试使用现有客户端
        if _supabase_client is not None:
            return _supabase_client
    except Exception:
        # 如果客户端状态异常，重置
        _supabase_client = None
    
    # 创建新客户端
    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_key:
        raise ValueError("SUPABASE_URL and SUPABASE_KEY must be set")
    
    # 创建带重试的 HTTP 客户端
    http_client = httpx.Client(
        http2=False,  # 禁用 HTTP/2，避免并发问题
        timeout=httpx.Timeout(30.0),
        retries=max_retries,
    )
    
    _supabase_client = create_client(
        settings.supabase_url, 
        settings.supabase_key,
        http_client=http_client
    )
    return _supabase_client


def get_db() -> Client:
    """获取数据库客户端（延迟初始化）"""
    return get_supabase()


class _SupabaseProxy:
    """延迟初始化代理，确保在首次访问时才连接"""
    def __getattr__(self, name):
        return getattr(get_supabase(), name)


supabase = _SupabaseProxy()
