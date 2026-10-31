; AgentOffice's own steps in the Windows installer (Tauri's NSIS hooks).
;
; The helper program Claude Code runs for each event lives in a folder of its own,
; %LOCALAPPDATA%\AgentOffice\bin, not among the install folder's files, so an update (which
; replaces those) never leaves Claude Code's entries pointing at nothing. The app puts it there
; when the user connects; an update refreshes it here only when it is there already. Nothing is
; connected by installing.
;
; Start with Windows: one per-user entry in Windows' Run list ("AgentOffice"), starting the app
; quietly (the island and the tray icon; no office window). The welcome page has a box for it,
; ticked; a quiet install (no pages) takes it ticked; an update keeps the user's choice and only
; points an existing entry at this install.

!include nsDialogs.nsh
!define AO_RUN_KEY "Software\Microsoft\Windows\CurrentVersion\Run"
Var AOAutostart
Var AOAutostartBox

; The welcome page (the first page; these definitions belong to it) gains the box.
!define MUI_PAGE_CUSTOMFUNCTION_SHOW AOWelcomeShow
!define MUI_PAGE_CUSTOMFUNCTION_LEAVE AOWelcomeLeave

Function AOWelcomeShow
  ; The box's words in the installer's language.
  StrCpy $0 "Start AgentOffice when Windows starts"
  ${If} $LANGUAGE == 1055
    StrCpy $0 "Windows açılınca başlat"
  ${ElseIf} $LANGUAGE == 1031
    StrCpy $0 "AgentOffice mit Windows starten"
  ${ElseIf} $LANGUAGE == 1034
    StrCpy $0 "Iniciar AgentOffice con Windows"
  ${ElseIf} $LANGUAGE == 1036
    StrCpy $0 "Lancer AgentOffice au démarrage de Windows"
  ${ElseIf} $LANGUAGE == 1040
    StrCpy $0 "Avvia AgentOffice con Windows"
  ${ElseIf} $LANGUAGE == 1046
    StrCpy $0 "Iniciar o AgentOffice com o Windows"
  ${ElseIf} $LANGUAGE == 1049
    StrCpy $0 "Запускать AgentOffice вместе с Windows"
  ${ElseIf} $LANGUAGE == 1041
    StrCpy $0 "Windows の起動時に AgentOffice を開始"
  ${ElseIf} $LANGUAGE == 1042
    StrCpy $0 "Windows 시작 시 AgentOffice 실행"
  ${ElseIf} $LANGUAGE == 2052
    StrCpy $0 "随 Windows 启动 AgentOffice"
  ${EndIf}
  ${NSD_CreateCheckbox} 120u 170u 195u 12u "$0"
  Pop $AOAutostartBox
  SetCtlColors $AOAutostartBox "" "FFFFFF"
  ${If} $AOAutostart != "0"
    ${NSD_Check} $AOAutostartBox
  ${EndIf}
FunctionEnd

Function AOWelcomeLeave
  ${NSD_GetState} $AOAutostartBox $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $AOAutostart "1"
  ${Else}
    StrCpy $AOAutostart "0"
  ${EndIf}
FunctionEnd

; WebView2 listed by Windows but its program missing (a stale entry; seen in a clean Windows
; Sandbox): Tauri's check reads only the listing and skips it, and the app could not start. Then
; Microsoft's own bootstrapper (the link Tauri uses) puts the runtime in place, quietly.
!define AO_WEBVIEW2_KEY "Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"
!macro NSIS_HOOK_PREINSTALL
  ReadRegStr $0 HKLM "SOFTWARE\WOW6432Node\${AO_WEBVIEW2_KEY}" "pv"
  ${If} $0 == ""
    ReadRegStr $0 HKLM "SOFTWARE\${AO_WEBVIEW2_KEY}" "pv"
  ${EndIf}
  ${If} $0 == ""
    ReadRegStr $0 HKCU "Software\${AO_WEBVIEW2_KEY}" "pv"
  ${EndIf}
  ; What was found, for the record (the installer's own log in the temporary folder).
  FileOpen $2 "$TEMP\agentoffice-webview2-check.log" w
  FileWrite $2 "listed: $0$\r$\n"
  ${If} ${FileExists} "$PROGRAMFILES32\Microsoft\EdgeWebView\Application\$0\msedgewebview2.exe"
    FileWrite $2 "machine program: there$\r$\n"
  ${EndIf}
  ${If} ${FileExists} "$LOCALAPPDATA\Microsoft\EdgeWebView\Application\$0\msedgewebview2.exe"
    FileWrite $2 "user program: there$\r$\n"
  ${EndIf}
  FileClose $2
  ${If} $0 != ""
  ${AndIfNot} ${FileExists} "$PROGRAMFILES32\Microsoft\EdgeWebView\Application\$0\msedgewebview2.exe"
  ${AndIfNot} ${FileExists} "$LOCALAPPDATA\Microsoft\EdgeWebView\Application\$0\msedgewebview2.exe"
    DetailPrint "WebView2 $0 is listed but not there: installing it"
    Delete "$TEMP\MicrosoftEdgeWebview2Setup.exe"
    NSISdl::download "https://go.microsoft.com/fwlink/p/?LinkId=2124703" "$TEMP\MicrosoftEdgeWebview2Setup.exe"
    Pop $1
    ${If} $1 == "success"
      ExecWait '"$TEMP\MicrosoftEdgeWebview2Setup.exe" /silent /install' $1
      DetailPrint "WebView2 bootstrapper finished: $1"
      FileOpen $2 "$TEMP\agentoffice-webview2-check.log" a
      FileWrite $2 "bootstrapper exit: $1$\r$\n"
      FileClose $2
    ${Else}
      DetailPrint "WebView2 bootstrapper could not be downloaded: $1"
      FileOpen $2 "$TEMP\agentoffice-webview2-check.log" a
      FileWrite $2 "download: $1$\r$\n"
      FileClose $2
    ${EndIf}
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ${If} ${FileExists} "$LOCALAPPDATA\AgentOffice\bin\agentoffice-hook.exe"
    CopyFiles /SILENT "$INSTDIR\agentoffice-hook.exe" "$LOCALAPPDATA\AgentOffice\bin"
  ${EndIf}
  ${If} $UpdateMode = 1
    ; An update: the user's choice stays; an existing entry starts this install.
    ReadRegStr $0 HKCU "${AO_RUN_KEY}" "AgentOffice"
    ${If} $0 != ""
      WriteRegStr HKCU "${AO_RUN_KEY}" "AgentOffice" '"$INSTDIR\${MAINBINARYNAME}.exe" --background'
    ${EndIf}
  ${ElseIf} $AOAutostart == "0"
    DeleteRegValue HKCU "${AO_RUN_KEY}" "AgentOffice"
  ${Else}
    WriteRegStr HKCU "${AO_RUN_KEY}" "AgentOffice" '"$INSTDIR\${MAINBINARYNAME}.exe" --background'
  ${EndIf}
!macroend

; Uninstalling (not the old version's removal during an update): only AgentOffice's own entries
; leave Claude Code's settings, edited as they are now (no old backup is put back), the helper
; folder goes, and so does the start-with-Windows entry. The user's other settings and hooks stay.
!macro NSIS_HOOK_PREUNINSTALL
  ${If} $UpdateMode <> 1
    nsExec::ExecToLog '"$INSTDIR\${MAINBINARYNAME}.exe" --uninstall-cleanup'
    Pop $0
    DeleteRegValue HKCU "${AO_RUN_KEY}" "AgentOffice"
  ${EndIf}
!macroend
