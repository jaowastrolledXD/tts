"""Gera fala em memória usando Edge TTS ou voz local do Windows; áudio sai por stdout."""
import asyncio
import base64
import os
import shutil
import subprocess
import sys
import json
import re
import inspect
import urllib.parse
import urllib.request
from pathlib import Path

from edge_tts import Communicate

FEMALE_NAMES = {
    "Francisca", "Brenda", "Elza", "Giovanna", "Leticia", "Manuela", "Thalita"
}


def gender_for_edge_voice(voice: str) -> str:
    name = voice.removeprefix("pt-BR-").removesuffix("Neural")
    return "Female" if name in FEMALE_NAMES else "Male"


def windows_sapi_fallback_bytes(text: str, voice: str) -> tuple[bytes, str]:
    """Gera WAV em memória via System.Speech; não cria arquivo de áudio."""
    if os.name != "nt":
        raise RuntimeError("O fallback de voz local só está disponível no Windows.")

    powershell = shutil.which("powershell.exe") or shutil.which("powershell")
    if not powershell:
        raise RuntimeError("PowerShell não encontrado para usar a voz local do Windows.")

    script_path = Path(__file__).with_name("tts_windows.ps1")
    command = [
        powershell,
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy", "Bypass",
        "-File", str(script_path),
        "-VoiceGender", gender_for_edge_voice(voice),
        "-TextBase64",
    ]
    # Passe o texto como Base64 ASCII para evitar que o Windows PowerShell
    # interprete á, é, ç, ã etc. usando uma página de código diferente.
    encoded_text = base64.b64encode(text.encode("utf-8")).decode("ascii")
    result = subprocess.run(
        command,
        input=encoded_text,
        text=True,
        encoding="ascii",
        errors="replace",
        capture_output=True,
        check=False,
        timeout=90,
    )
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "sem detalhes").strip()
        raise RuntimeError(f"A voz local do Windows falhou: {detail[-1500:]}")

    encoded = result.stdout.strip()
    try:
        audio = base64.b64decode(encoded, validate=True)
    except Exception as exc:
        raise RuntimeError("O Windows não retornou um áudio WAV válido em memória.") from exc
    if not audio.startswith(b"RIFF") or b"WAVE" not in audio[:16]:
        raise RuntimeError("O Windows retornou dados que não parecem ser um WAV válido.")

    detail = result.stderr.strip() or "voz local do Windows"
    return audio, detail



class PreservePostRedirectHandler(urllib.request.HTTPRedirectHandler):
    """Segue redirecionamentos 307/308 preservando POST e seu corpo JSON.

    O handler padrão do urllib pode recusar um 307 em uma requisição POST,
    fazendo o TTS cair no fallback local mesmo quando o redirecionamento é válido.
    Só aceita destino HTTPS para não enviar texto em claro.
    """
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if code in (307, 308) and req.get_method() == "POST":
            parsed = urllib.parse.urlparse(newurl)
            if parsed.scheme.lower() != "https" or not parsed.hostname:
                return None
            return urllib.request.Request(
                newurl,
                data=req.data,
                headers=dict(req.header_items()),
                origin_req_host=req.origin_req_host,
                unverifiable=True,
                method="POST",
            )
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def fish_tts_bytes(text: str, reference_id: str) -> tuple[bytes, str]:
    """Gera voz através da API oficial da Fish Audio usando uma voz pública."""
    api_key = os.environ.get("FISH_API_KEY", "").strip()
    if not api_key or api_key in {"COLE_SUA_CHAVE_AQUI", "YOUR_FISH_AUDIO_API_KEY"}:
        raise RuntimeError(
            "FISH_API_KEY não configurada. Crie uma chave em https://fish.audio/app/api-keys "
            "e adicione FISH_API_KEY=... ao arquivo .env."
        )

    # A fala de clímax usa explicitamente o modelo S2.1, que entende as tags
    # de grito. Isso evita um modelo legado configurado no .env ignorar as tags.
    is_galactic_cry = bool(re.search(r"explos[aã]o\s+gal[aá]ctica", text, re.IGNORECASE))
    model = os.environ.get("FISH_TTS_MODEL", "s2.1-pro-free").strip() or "s2.1-pro-free"
    if is_galactic_cry and model.lower() in {"speech-1.5", "speech-1.6", "s1"}:
        model = "s2.1-pro-free"
    body = json.dumps(
        {"text": text, "reference_id": reference_id, "format": "mp3"},
        ensure_ascii=False,
    ).encode("utf-8")
    request = urllib.request.Request(
        "https://api.fish.audio/v1/tts",
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "Accept": "audio/mpeg, application/octet-stream",
            "model": model,
            "User-Agent": "VSync-TTS/1.0",
        },
    )
    try:
        timeout_seconds = max(10, min(90, int(os.environ.get("FISH_TTS_TIMEOUT", "35"))))
        with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
            audio = response.read()
    except urllib.error.HTTPError as exc:
        try:
            detail = exc.read(1500).decode("utf-8", errors="replace").strip()
        except Exception:
            detail = ""
        # Não incluir nem imprimir a chave API no texto de erro.
        raise RuntimeError(
            f"Fish Audio retornou HTTP {exc.code}: {detail or exc.reason}. "
            "Confira a chave API, acesso ao modelo, cota e modelo configurado."
        ) from exc
    except Exception as exc:
        raise RuntimeError(f"Falha de conexão com Fish Audio ({type(exc).__name__}: {exc}).") from exc

    if not audio:
        raise RuntimeError("Fish Audio retornou áudio vazio.")
    # Quando o serviço responde JSON em vez de áudio, mostre um erro claro.
    if audio.lstrip().startswith((b"{", b"[")):
        preview = audio[:500].decode("utf-8", errors="replace")
        raise RuntimeError(f"Fish Audio retornou JSON em vez de áudio: {preview}")
    return audio, f"Fish Audio ({reference_id})"


def fish_tts_stream(text: str, reference_id: str) -> None:
    """Emite os blocos MP3 assim que chegam do WebSocket da Fish Audio."""
    api_key = os.environ.get("FISH_API_KEY", "").strip()
    if not api_key or api_key in {"COLE_SUA_CHAVE_AQUI", "YOUR_FISH_AUDIO_API_KEY"}:
        raise RuntimeError("FISH_API_KEY não configurada.")

    try:
        from fishaudio import FishAudio
    except ImportError as exc:
        raise RuntimeError(
            "Streaming Fish Audio precisa do pacote fish-audio-sdk. Execute: "
            "python -m pip install -r requirements.txt"
        ) from exc

    client = FishAudio(api_key=api_key)
    def text_chunks():
        # Uma mensagem do chat já chega pronta; enviar logo o texto completo
        # evita introduzir atraso artificial palavra por palavra.
        yield text

    stream_method = client.tts.stream_websocket
    kwargs = {"reference_id": reference_id, "latency": "balanced"}
    # Preserva o modelo configurado sempre que a versão instalada do SDK o expõe.
    try:
        params = inspect.signature(stream_method).parameters
        if "model" in params:
            kwargs["model"] = os.environ.get("FISH_TTS_MODEL", "s2.1-pro-free").strip() or "s2.1-pro-free"
    except (TypeError, ValueError):
        pass

    sent = False
    try:
        for chunk in stream_method(text_chunks(), **kwargs):
            if not chunk:
                continue
            sys.stdout.buffer.write(chunk)
            sys.stdout.buffer.flush()
            sent = True
    except Exception as exc:
        if sent:
            # Não concatenar uma segunda geração REST em um MP3 já parcialmente transmitido.
            raise RuntimeError(f"STREAM_PARTIAL: {type(exc).__name__}: {exc}") from exc
        raise
    if not sent:
        raise RuntimeError("Fish Audio streaming terminou sem retornar áudio.")


def tiktok_tts_bytes(text: str, speaker: str) -> tuple[bytes, str]:
    """Gera áudio via proxy comunitário TikTok TTS, sem usar cookie de login."""
    base_url = os.environ.get(
        "TIKTOK_TTS_URL", "https://tiktok-tts.weilnet.workers.dev"
    ).strip().rstrip("/")
    if not base_url:
        base_url = "https://tiktok-tts.weilnet.workers.dev"

    endpoint = base_url if base_url.endswith("/api/generation") else f"{base_url}/api/generation"
    body = json.dumps({"text": text, "voice": speaker}, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        endpoint,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "VSync-TTS/1.0",
        },
    )
    try:
        opener = urllib.request.build_opener(PreservePostRedirectHandler())
        with opener.open(request, timeout=35) as response:
            raw = response.read()
    except Exception as exc:
        location = ""
        if isinstance(exc, urllib.error.HTTPError):
            location = exc.headers.get("Location", "")
        extra = f" Destino do redirecionamento: {location}" if location else ""
        raise RuntimeError(
            f"O proxy TikTok TTS não respondeu ({type(exc).__name__}: {exc}).{extra} "
            "Verifique a conexão ou tente novamente mais tarde."
        ) from exc

    try:
        payload = json.loads(raw.decode("utf-8"))
    except Exception as exc:
        raise RuntimeError("O proxy TikTok TTS retornou uma resposta que não é JSON válido.") from exc

    encoded = payload.get("data") if isinstance(payload, dict) else None
    if isinstance(encoded, dict):
        encoded = encoded.get("data") or encoded.get("audio") or encoded.get("v_str")
    if not isinstance(encoded, str) or not encoded.strip():
        message = payload.get("error") if isinstance(payload, dict) else None
        raise RuntimeError(f"O proxy não gerou áudio: {message or 'resposta sem campo data'}")

    try:
        audio = base64.b64decode(encoded, validate=True)
    except Exception as exc:
        raise RuntimeError("O proxy retornou áudio Base64 inválido.") from exc
    if not audio:
        raise RuntimeError("O proxy retornou áudio vazio.")
    return audio, f"TikTok TTS via proxy ({speaker})"

async def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("Uso: python tts_generate.py VOZ (texto via stdin; áudio via stdout)")

    voice = sys.argv[1]
    # stdin vem do Node.js como UTF-8; decodifique explicitamente em vez de
    # depender da codificação regional padrão do Windows (ex.: cp1252).
    try:
        text = sys.stdin.buffer.read().decode("utf-8").strip()
    except UnicodeDecodeError as exc:
        raise SystemExit("O texto recebido não está em UTF-8 válido; confira a codificação do bot.") from exc
    if not text:
        raise SystemExit("Texto vazio")

    if voice.startswith("fish:"):
        reference_id = voice.split(":", 1)[1]
        # Streaming só é usado quando ativado; assim, erros de conexão antes do
        # primeiro bloco ainda podem cair com segurança para a voz local.
        is_galactic_cry = bool(re.search(r"explos[aã]o\s+gal[aá]ctica", text, re.IGNORECASE))
        streaming_enabled = os.environ.get("FISH_TTS_STREAMING", "1").strip().lower() not in {"0", "false", "no", "off"}
        # Para esse clímax, prioriza REST para garantir o modelo S2.1 configurado
        # e manter todas as tags de interpretação na mesma geração.
        if streaming_enabled and not is_galactic_cry:
            try:
                print(f"[TTS] Fish Audio streaming ativo ({reference_id}; latência balanceada).", file=sys.stderr)
                fish_tts_stream(text, reference_id)
                return
            except Exception as stream_error:
                if "STREAM_PARTIAL:" in str(stream_error):
                    raise SystemExit(f"A transmissão Fish Audio foi interrompida após começar: {stream_error}") from stream_error
                print(f"[TTS] Streaming Fish Audio falhou ({stream_error}); tentando geração REST normal.", file=sys.stderr)
        elif is_galactic_cry:
            print("[TTS] Clímax anime detectado: usando REST para aplicar as tags S2.1.", file=sys.stderr)
        try:
            audio, message = fish_tts_bytes(text, reference_id)
            print(f"[TTS] Voz ativa: {message}", file=sys.stderr)
        except Exception as fish_error:
            print(
                f"[TTS] Fish Audio indisponível ({fish_error}); usando voz local do Windows como alternativa.",
                file=sys.stderr,
            )
            try:
                audio, message = windows_sapi_fallback_bytes(text, "pt-BR-FranciscaNeural")
            except Exception as fallback_error:
                raise SystemExit(
                    "Fish Audio não funcionou e a voz local do Windows também falhou. "
                    f"Fish Audio: {fish_error}. Fallback: {fallback_error}"
                ) from fallback_error
            print(f"[TTS] Fallback ativo: {message}", file=sys.stderr)
        sys.stdout.buffer.write(audio)
        sys.stdout.buffer.flush()
        return

    if voice.startswith("tiktok:"):
        speaker = voice.split(":", 1)[1]
        try:
            audio, message = tiktok_tts_bytes(text, speaker)
            print(f"[TTS] Voz ativa: {message}", file=sys.stderr)
        except Exception as tiktok_error:
            # Não deixar a fila morrer se o proxy TTS estiver indisponível.
            print(
                f"[TTS] Voz TikTok indisponível ({tiktok_error}); usando voz local do Windows como alternativa.",
                file=sys.stderr,
            )
            try:
                audio, message = windows_sapi_fallback_bytes(text, "pt-BR-FranciscaNeural")
            except Exception as fallback_error:
                raise SystemExit(
                    "A voz TikTok não funcionou e a voz local do Windows também falhou. "
                    f"TikTok: {tiktok_error}. Fallback: {fallback_error}"
                ) from fallback_error
            print(f"[TTS] Fallback ativo: {message}", file=sys.stderr)
        sys.stdout.buffer.write(audio)
        sys.stdout.buffer.flush()
        return

    try:
        communicate = Communicate(text, voice)
        chunks: list[bytes] = []
        async for message in communicate.stream():
            if message.get("type") == "audio" and message.get("data"):
                chunks.append(message["data"])
        audio = b"".join(chunks)
        if not audio:
            raise RuntimeError("O Edge TTS não retornou áudio.")
    except Exception as edge_error:
        print(
            f"Edge TTS indisponível ({type(edge_error).__name__}); tentando voz local do Windows...",
            file=sys.stderr,
        )
        try:
            audio, message = windows_sapi_fallback_bytes(text, voice)
        except Exception as fallback_error:
            raise SystemExit(
                "Não foi possível gerar o áudio nem com Edge TTS nem com a voz local do Windows. "
                f"Edge TTS: {edge_error}. Fallback: {fallback_error}"
            ) from fallback_error
        print(f"[TTS] Fallback ativo: {message}", file=sys.stderr)

    # Somente bytes de áudio vão para stdout; nenhuma cópia é gravada em disco.
    sys.stdout.buffer.write(audio)
    sys.stdout.buffer.flush()


if __name__ == "__main__":
    asyncio.run(main())
