@echo off
cd /d %~dp0

echo ============================
echo GitHub Auto Upload Script
echo ============================

set /p repoName=Enter GitHub Repository Name: 
set /p userName=Enter GitHub Username: 

echo Initializing Git repository...
git init

echo Adding files...
git add .

echo Committing...
git commit -m "first upload"

echo Setting main branch...
git branch -M main

echo Connecting to GitHub...
git remote remove origin 2>nul
git remote add origin https://github.com/%userName%/%repoName%.git

echo Pulling (to fix conflicts if any)...
git pull origin main --allow-unrelated-histories

echo Pushing to GitHub...
git push -u origin main

echo ============================
echo DONE! Project uploaded
echo ============================
pause
