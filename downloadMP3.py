import sys
import os
from pytubefix import YouTube

def descargar_audio_por_id(video_id):
    url_base = f'https://www.youtube.com/watch?v={video_id}'
    try:
        yt = YouTube(url_base)
        audio_stream = yt.streams.filter(only_audio=True).order_by('abr').desc().first()
        
        if audio_stream:
            filename = f"{video_id}.mp3"
            audio_stream.download(filename=filename)
            sys.exit(0) 
        else:
            sys.exit(1)
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) > 1:
        descargar_audio_por_id(sys.argv[1])