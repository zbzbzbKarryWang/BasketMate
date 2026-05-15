from typing import Optional


class User:
    """当前用户对象，预留用于未来认证功能"""
    def __init__(self, id: str = "anonymous", email: Optional[str] = None):
        self.id = id
        self.email = email


async def get_current_user() -> User:
    """
    预留的认证依赖项。
    当前返回默认用户，未来可实现 JWT/Session 认证后替换。
    """
    return User(id="default_user", email="user@example.com")
