from datetime import datetime, timedelta

now = datetime.utcnow() + timedelta(hours=8)
time_str = now.strftime('%Y-%m-%d %H:%M:%S')
with open('temp_current_time.txt', 'w') as f:
    f.write(time_str)
print(f'时间已写入: {time_str}')
