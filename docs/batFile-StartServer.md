@echo off
REM Activate the virtual environment and run the Python server.

REM Navigate to the Py-ScholarAI directory.
cd /D D:\Repos2\Py-ScholarAI

REM Activate the virtual environment.
call venv\Scripts\activate.bat

REM Check if the virtual environment was activated successfully.
if errorlevel 1 (
    echo Failed to activate the virtual environment.
    exit /b 1
)

REM Run the Python server.
python src\api\run_server.py

REM Deactivate the virtual environment (optional, but recommended).
call venv\Scripts\deactivate.bat

REM Exit the batch script.
exit /b 0