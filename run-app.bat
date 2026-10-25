@echo off
title Property Rent Management System
echo ========================================================
echo Starting Property Rent Management System
echo ========================================================

:: Check if MongoDB is running
netstat -ano | findstr 27017 >nul
if %errorlevel% neq 0 (
    echo Starting MongoDB...
    start "MongoDB" /min "C:\Program Files\MongoDB\Server\9.0\bin\mongod.exe" --dbpath "%~dp0data\db" --port 27017 --bind_ip 127.0.0.1
    timeout /t 3 /nobreak >nul
) else (
    echo MongoDB is already running.
)

:: Start Backend
echo Starting Backend API on port 5000...
start "Backend Server" /d "%~dp0server" cmd /k "node index.js"

:: Start Frontend
echo Starting Frontend Client on port 5173...
start "Frontend Client" /d "%~dp0client" cmd /k "npm run dev"

timeout /t 2 /nobreak >nul
echo Opening application in browser...
start http://localhost:5173

echo ========================================================
echo Application is running!
echo Frontend: http://localhost:5173
echo Backend:  http://localhost:5000
echo Login:    admin@propertyrent.com / AdminPassword123!
echo ========================================================
