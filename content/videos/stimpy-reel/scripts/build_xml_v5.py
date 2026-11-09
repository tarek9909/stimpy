"""FCP7 XML for stimpy_reel_v5: V1 = beat-length segments + end card, A1 = song from 0:26 (0 dB, fade out),
A2 = zip sound under the end card. Markers on every beat."""
import json, os, subprocess, urllib.parse
from xml.sax.saxutils import escape
W = r"C:\Users\aswad\Downloads\stimpy cuts\work"
e = json.load(open(W + r"\v5\edl_v5.json"))
SONG = r"C:\Users\aswad\Downloads\Drake - Money In The Grave ft. Rick Ross.mp3"
CARD = W + r"\end_card.png"; ZIP = W + r"\zip_sfx.wav"
OUT = W + r"\v5\stimpy_reel_v5.xml"
FPS = 30
FF = r"C:\Projects\motion\content\videos\second_video\stimpy\app\node_modules\ffmpeg-static\ffmpeg.exe"
def frames_of(p):
    r = subprocess.run([FF, "-i", p], capture_output=True, text=True).stderr
    h, m, s = r.split("Duration: ")[1].split(",")[0].split(":")
    return int(round((int(h) * 3600 + int(m) * 60 + float(s)) * FPS))
def url(p): return "file://localhost/" + urllib.parse.quote(p.replace("\\", "/"))
RATE = "<rate><timebase>30</timebase><ntsc>FALSE</ntsc></rate>"
fid = [0]
def file_el(p, video=True, audio=False, still=False):
    fid[0] += 1
    dur = 3600 if still else frames_of(p)
    media = ""
    if video: media += "<video><samplecharacteristics><width>1080</width><height>1920</height></samplecharacteristics></video>"
    if audio: media += "<audio><samplecharacteristics><depth>16</depth><samplerate>48000</samplerate></samplecharacteristics><channelcount>2</channelcount></audio>"
    return (f'<file id="f{fid[0]}"><name>{escape(os.path.basename(p))}</name><pathurl>{url(p)}</pathurl>{RATE}'
            f'<duration>{dur}</duration><media>{media}</media></file>')
def level(db=None, keys=None):
    body = ""
    if keys:
        body = "".join(f"<keyframe><when>{w}</when><value>{10 ** (d / 20):.5f}</value></keyframe>" for w, d in keys)
    v = 10 ** ((db or 0) / 20)
    return ("<filter><effect><name>Audio Levels</name><effectid>audiolevels</effectid><effectcategory>audiolevels</effectcategory>"
            "<effecttype>audiolevels</effecttype><mediatype>audio</mediatype><parameter><parameterid>level</parameterid>"
            f"<name>Level</name><valuemin>0</valuemin><valuemax>3.98109</valuemax><value>{v:.5f}</value>{body}</parameter></effect></filter>")
v = []
for i, s in enumerate(e["segs"]):
    n = s["end"] - s["start"]
    v.append(f'<clipitem id="v{i}"><name>{escape(s["label"])}</name><enabled>TRUE</enabled>{RATE}<start>{s["start"]}</start>'
             f'<end>{s["end"]}</end><in>0</in><out>{n}</out>{file_el(s["file"])}</clipitem>')
total = e["total"]; song_in = 26 * FPS
fade = [(0, 0), (total - 18, 0), (total, -40)]
a1 = (f'<clipitem id="song"><name>Money In The Grave (from 0:26)</name><enabled>TRUE</enabled>{RATE}<start>0</start><end>{total}</end>'
      f'<in>{song_in}</in><out>{song_in + total}</out>{file_el(SONG, video=False, audio=True)}'
      f'<sourcetrack><mediatype>audio</mediatype><trackindex>1</trackindex></sourcetrack>{level(0)}</clipitem>')
markers = "".join(f"<marker><name>Beat {i}</name><comment></comment><in>{f}</in><out>-1</out></marker>" for i, f in enumerate(e["markers"]) if i)
xml = f'''<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="4"><sequence id="seq-v5"><name>stimpy_reel_v5</name><duration>{total}</duration>{RATE}
<media><video><format><samplecharacteristics>{RATE}<width>1080</width><height>1920</height><pixelaspectratio>square</pixelaspectratio><fielddominance>none</fielddominance></samplecharacteristics></format>
<track>{"".join(v)}</track></video>
<audio><numOutputChannels>2</numOutputChannels><format><samplecharacteristics><depth>16</depth><samplerate>48000</samplerate></samplecharacteristics></format>
<track>{a1}</track></audio></media>
<timecode>{RATE}<string>00:00:00:00</string><frame>0</frame><displayformat>NDF</displayformat></timecode>
{markers}</sequence></xmeml>'''
open(OUT, "w", encoding="utf-8").write(xml)
print("wrote", OUT)
