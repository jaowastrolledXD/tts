@echo off
setlocal
cd /d "%~dp0"

if not exist .env (
  echo Crie o arquivo .env copiando .env.example e cole o token do bot.
  pause
  exit /b 1
)

rem Use o mesmo Python definido no .env, se houver.
set "PYTHON_CMD=python"
for /f "usebackq tokens=1,* delims==" %%A in (".env") do (
  if /I "%%A"=="PYTHON_PATH" set "PYTHON_CMD=%%B"
)
set PYTHON_CMD=%PYTHON_CMD:"=%
if "%PYTHON_CMD%"=="" set "PYTHON_CMD=python"

echo Verificando o SDK do Fish Audio...
call "%PYTHON_CMD%" -c "import fishaudio" >nul 2>&1
if errorlevel 1 (
  echo SDK nao encontrado. Instalando as dependencias de Python...
  call "%PYTHON_CMD%" -m pip install -r requirements.txt
  if errorlevel 1 (
    echo.
    echo ERRO: nao foi possivel instalar as dependencias.
    echo Verifique a internet e se o Python esta instalado corretamente.
    echo Comando manual: python -m pip install -r requirements.txt
    pause
    exit /b 1
  )
  call "%PYTHON_CMD%" -c "import fishaudio" >nul 2>&1
  if errorlevel 1 (
    echo.
    echo ERRO: o SDK ainda nao pode ser importado pelo Python configurado em PYTHON_PATH.
    echo Confira o caminho configurado no arquivo .env.
    pause
    exit /b 1
  )
  echo SDK do Fish Audio instalado com sucesso.
) else (
  echo SDK do Fish Audio ja instalado.
)

call npm start
pause
