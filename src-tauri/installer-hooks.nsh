!macro NSIS_HOOK_PREINSTALL
  FileOpen $0 "$TEMP\ViewStage-upgrading" w
  FileClose $0
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  ExecWait '"$INSTDIR\ViewStage.exe" --uninstall-cleanup'
!macroend

!macro NSIS_HOOK_POSTINSTALL
  Delete "$TEMP\ViewStage-upgrading"
!macroend
