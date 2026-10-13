param(
    [Parameter(Mandatory = $true)][ValidateSet('Female', 'Male')][string]$VoiceGender,
    [switch]$TextBase64
)

$ErrorActionPreference = 'Stop'
# A entrada é Base64 ASCII. Decodificar para UTF-8 explicitamente evita
# corrupção de caracteres acentuados em versões do Windows PowerShell.
$inputPayload = [Console]::In.ReadToEnd()
if ($TextBase64) {
    try {
        $text = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($inputPayload.Trim()))
    } catch {
        throw 'Não foi possível decodificar o texto UTF-8 recebido.'
    }
} else {
    [Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
    $text = $inputPayload
}
if ([string]::IsNullOrWhiteSpace($text)) {
    throw 'Texto vazio recebido pelo gerador de voz local.'
}

Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$memory = New-Object System.IO.MemoryStream
try {
    $voices = @($synth.GetInstalledVoices() | Where-Object { $_.Enabled } | ForEach-Object { $_.VoiceInfo })
    if ($voices.Count -eq 0) {
        throw 'Nenhuma voz de leitura está instalada no Windows.'
    }

    # Primeiro tenta português brasileiro E o gênero solicitado.
    $selected = $voices | Where-Object {
        $_.Culture.Name -eq 'pt-BR' -and $_.Gender.ToString() -eq $VoiceGender
    } | Select-Object -First 1

    # Importante: se não houver essa combinação, prioriza o gênero em qualquer
    # idioma antes de cair numa voz pt-BR de gênero errado. Assim uma voz
    # masculina instalada não é ignorada só porque não está marcada como pt-BR.
    if (-not $selected) {
        $selected = $voices | Where-Object {
            $_.Gender.ToString() -eq $VoiceGender
        } | Select-Object -First 1
    }

    # Não use silenciosamente uma voz do gênero oposto: isso faria a opção
    # masculina/feminina parecer quebrada. Falhe com uma mensagem clara se
    # não existir nenhuma voz instalada do gênero solicitado.
    if (-not $selected) {
        throw "Nenhuma voz '$VoiceGender' está instalada no Windows. Adicione uma voz desse gênero em Configurações > Hora e idioma > Fala."
    }

    $synth.SelectVoice($selected.Name)
    $synth.SetOutputToWaveStream($memory)
    $synth.Speak($text)
    $synth.SetOutputToNull()
    $memory.Flush()
    $audioBytes = $memory.ToArray()

    # O PowerShell devolve Base64 pela saída padrão; o Python decodifica em memória.
    [Console]::Out.Write([Convert]::ToBase64String($audioBytes))
    [Console]::Error.WriteLine("voz '$($selected.Name)' ($($selected.Culture.Name))")
}
finally {
    $memory.Dispose()
    $synth.Dispose()
}
