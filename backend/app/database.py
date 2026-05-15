from supabase import create_client, Client
from .config import get_settings

_supabase_client: Client | None = None


def get_supabase() -> Client:
    global _supabase_client
    if _supabase_client is None:
        settings = get_settings()
        if not settings.supabase_url or not settings.supabase_key:
            raise ValueError("SUPABASE_URL and SUPABASE_KEY must be set")
        _supabase_client = create_client(settings.supabase_url, settings.supabase_key)
    return _supabase_client


def get_db() -> Client:
    """获取数据库客户端（延迟初始化）"""
    return get_supabase()


class _SupabaseProxy:
    """延迟初始化代理，确保在首次访问时才连接"""
    def __getattr__(self, name):
        return getattr(get_supabase(), name)


supabase = _SupabaseProxy()
