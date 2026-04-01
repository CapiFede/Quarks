//
//  Generated file. Do not edit.
//

import FlutterMacOS
import Foundation

import audio_session
import auto_updater_macos
import just_audio
import screen_retriever_macos
import window_manager

func RegisterGeneratedPlugins(registry: FlutterPluginRegistry) {
  AudioSessionPlugin.register(with: registry.registrar(forPlugin: "AudioSessionPlugin"))
  AutoUpdaterMacosPlugin.register(with: registry.registrar(forPlugin: "AutoUpdaterMacosPlugin"))
  JustAudioPlugin.register(with: registry.registrar(forPlugin: "JustAudioPlugin"))
  ScreenRetrieverMacosPlugin.register(with: registry.registrar(forPlugin: "ScreenRetrieverMacosPlugin"))
  WindowManagerPlugin.register(with: registry.registrar(forPlugin: "WindowManagerPlugin"))
}
