@echo off
REM ต้องวางไฟล์นี้ไว้ในโฟลเดอร์ DelightApp (โฟลเดอร์เดียวกับที่ clone มาจาก GitHub)
cd /d "%~dp0"

echo ===== กำลังเช็คไฟล์ที่แก้ไข =====
git add .

set "msg="
set /p msg="อธิบายสั้นๆ ว่าแก้อะไร (Enter เพื่อข้าม ใช้ค่าเริ่มต้น): "
if "%msg%"=="" set "msg=update %date% %time%"

echo.
echo ===== กำลัง commit =====
git commit -m "%msg%"

echo.
echo ===== กำลัง push ขึ้น GitHub =====
git push

echo.
echo ===== เสร็จแล้ว =====
pause
