; Quarks - Inno Setup Script
; Requisito: compilar DESPUÉS de "flutter build windows --release"

[Setup]
AppName=Quarks
AppVersion=1.0.0
AppPublisher=Tu Nombre
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
Name: "{commondesktop}\Quarks"; Filename: "{app}\quarks.exe"

[Run]
Filename: "{app}\quarks.exe"; Description: "Lanzar Quarks"; Flags: postinstall nowait
