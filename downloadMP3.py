import sys
import os
from pytubefix import YouTube
from pytubefix.cli import on_progress

def descargar_audio_por_id(video_id):
    url = f'https://www.youtube.com/watch?v={video_id}'
    
    try:
        # Inicializamos YouTube con pytubefix
        # 'use_oauth=True' ayuda a evitar bloqueos de bots si tienes problemas
        yt = YouTube(url, on_progress_callback=on_progress, use_po_token=True)
        
        # Filtramos para obtener solo el audio con la mejor calidad posible
        # Normalmente el formato mp4 o m4a de audio es el más compatible
        video = yt.streams.filter(only_audio=True).first()
        
        # Descargamos el archivo
        # outtmpl en pytubefix se maneja con filename
        out_file = video.download(filename=f"{video_id}.mp3")
        
        # Opcional: Si pytubefix lo descarga como .m4a o .webm, 
        # lo renombramos a .mp3 para que tu app lo reconozca
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