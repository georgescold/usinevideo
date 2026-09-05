@echo off
chcp 65001 >nul
setlocal

REM ===========================================================================
REM  Start.bat — ouvre l'atelier de cette chaine.
REM
REM  Ce fichier ne fait RIEN que la ligne de commande ne sache faire : il se
REM  place dans le dossier, verifie ce qui manque, et lance `npm run atelier`.
REM  C'est la regle du depot — l'atelier appelle des commandes, il n'en
REM  remplace aucune. Si ce .bat disparait, tout reste utilisable au terminal.
REM
REM  Le dossier est autonome et deplacable : `%~dp0` designe l'endroit ou se
REM  trouve CE fichier, donc le raccourci suit le dossier si on le renomme ou
REM  si on le pose sur un disque partage.
REM ===========================================================================

cd /d "%~dp0"

title Atelier — %~n0

echo.
echo   USINE A VIDEO
echo   ---------------------------------------------------------------
echo   Dossier : %CD%
echo.

REM -- Node est-il la ? ------------------------------------------------------
where node >nul 2>nul
if errorlevel 1 (
  echo   [X] Node.js est introuvable.
  echo.
  echo       Installe-le depuis https://nodejs.org (version LTS^), puis
  echo       relance ce fichier. Rien d'autre n'est necessaire.
  echo.
  pause
  exit /b 1
)

for /f "delims=" %%v in ('node --version') do set NODEVER=%%v
echo   Node %NODEVER%

REM -- Les dependances sont-elles installees ? -------------------------------
REM  On teste un dossier PRECIS et pas seulement `node_modules` : une
REM  installation interrompue laisse le dossier en place mais vide, et
REM  `npm run` echoue alors avec un message qui ne dit pas quoi faire.
if not exist "node_modules\remotion" (
  echo   Premiere ouverture : installation des dependances...
  echo   ^(quelques minutes, une seule fois^)
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo   [X] L'installation a echoue. Regarde le message ci-dessus.
    echo.
    pause
    exit /b 1
  )
  echo.
)

REM -- L'environnement est-il complet ? --------------------------------------
REM  `verifie` controle les outils, les cles et les modeles. On l'affiche mais
REM  on ne bloque pas dessus : il manque peut-etre seulement une cle dont on
REM  n'a pas besoin aujourd'hui, et rien n'oblige a tout avoir pour regler des
REM  sous-titres.
call npm run verifie
echo.

REM -- L'atelier ------------------------------------------------------------
echo   ---------------------------------------------------------------
echo   L'atelier s'ouvre dans le navigateur.
echo   Laisse CETTE fenetre ouverte : c'est elle qui fait tourner le
echo   serveur. Ctrl+C, ou fermer la fenetre, arrete tout.
echo   ---------------------------------------------------------------
echo.

call npm run atelier -- --ouvre

REM  Si l'atelier s'arrete sur une erreur, la fenetre se fermerait avant qu'on
REM  ait pu lire le message. On la retient.
echo.
if errorlevel 1 (
  echo   [X] L'atelier s'est arrete sur une erreur. Le message est au-dessus.
) else (
  echo   Atelier arrete.
)
echo.
pause
endlocal
