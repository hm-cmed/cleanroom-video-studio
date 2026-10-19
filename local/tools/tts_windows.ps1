# 1本の原稿（JSON）の場面ごとのナレーションを Windows 標準の音声合成で作る。
# make_all.py から自動で呼ばれる（手で実行する必要はない）。
param([Parameter(Mandatory=$true)][string]$Script, [Parameter(Mandatory=$true)][string]$OutDir, [int]$Rate = 1)
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$voice = $synth.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -eq 'ja-JP' } | Select-Object -First 1
if (-not $voice) { Write-Error "日本語の音声が見つかりません（設定 > 時刻と言語 > 言語 で日本語の音声を追加）"; exit 1 }
$synth.SelectVoice($voice.VoiceInfo.Name)
$synth.Rate = $Rate
$data = Get-Content -Raw -Encoding UTF8 $Script | ConvertFrom-Json
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$i = 1
foreach ($scene in $data.scenes) {
  $text = if ($scene.speech) { $scene.speech } else { $scene.narration }
  $synth.SetOutputToWaveFile((Join-Path (Resolve-Path $OutDir) "scene_$i.wav"))
  $synth.Speak($text)
  $i++
}
$synth.SetOutputToNull()
$synth.Dispose()
