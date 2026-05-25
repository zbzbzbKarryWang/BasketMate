from datetime import datetime, timedelta

now = datetime.utcnow() + timedelta(hours=8)
print(now.strftime('%Y-%m-%d %H:%M:%S'))
