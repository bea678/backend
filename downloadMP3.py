import sys
import os
from pytubefix import YouTube
from pytubefix.cli import on_progress

def descargar_audio_por_id(video_id):
    url = f'https://www.youtube.com/watch?v={video_id}'
    
    try:
        yt = YouTube(url, on_progress_callback=on_progress)
        video = yt.streams.filter(only_audio=True).first()
        out_file = video.download(filename=f"{video_id}.mp3")
        base, ext = os.path.splitext(out_file)
        new_file = video_id + '.mp3'
        
        if not out_file.endswith('.mp3'):
            os.rename(out_file, new_file)

        sys.exit(0)
        
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) > 1:
        descargar_audio_por_id(sys.argv[1])