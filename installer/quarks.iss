; Quarks - Inno Setup Script
; Uso manual:    compilar desde Inno Setup IDE
; Uso en CI:     iscc /DAppVersion=1.0.1 installer\quarks.iss

#ifndef AppVersion
  #define AppVersion "1.0.0"
#endif

[Setup]
AppName=Quarks
AppVersion={#AppVersion}
AppPublisher=CapiFede
DefaultDirName={localappdata}\Quarks
DefaultGroupName=Quarks
OutputDir=..\release
OutputBaseFilename=quarks-setup
Compression=lzma
SolidCompression=yes
; Sin UAC - no requiere ser administrador
PrivilegesRequired=lowest

[Files]
Source: "..\build\windows\x64\runner\Release\*"; DestDir: "{app}"; Flags: recursesubdirs

[Icons]
Name: "{group}\Quarks"; Filename: "{app}\quarks.exe"
Name: "{userdesktop}\Quarks"; Filename: "{app}\quarks.exe"

[Run]
Filename: "{app}\quarks.exe"; Description: "Lanzar Quarks"; Flags: postinstall nowait
