# usage: python3 hues.py <prefix> <theme>  — hue buckets of saturated pixels in the content area (x>=405) of the key screens
import sys
from PIL import Image
import colorsys
prefix,theme=sys.argv[1],sys.argv[2]
names=['usage','tasks','library','workflows','marketplace','providers','agent']
BUCKETS=[('red',[(345,360),(0,15)]),('orange',[(15,45)]),('yellow',[(45,70)]),('green',[(70,170)]),('cyan',[(170,200)]),('blue',[(200,255)]),('violet',[(255,300)]),('pink',[(300,345)])]
def bucket(h):
    for n,rs in BUCKETS:
        for a,b in rs:
            if a<=h<b: return n
tot={}
print(f'{"screen":12} hues>0.4%  detail')
for n in names:
    try: im=Image.open(f'shots/{prefix}-{n}-{theme}.png').convert('RGB')
    except Exception: continue
    im=im.crop((405,0,im.size[0],im.size[1])).resize((518,450))
    px=im.load(); w,h=im.size; cnt={}
    for x in range(w):
        for y in range(h):
            r,g,b=[v/255 for v in px[x,y]]
            hh,s,v=colorsys.rgb_to_hsv(r,g,b)
            if s>0.45 and v>0.35: cnt[bucket(hh*360)]=cnt.get(bucket(hh*360),0)+1
    area=w*h; big={k:round(100*v/area,2) for k,v in cnt.items() if v/area>0.004}
    print(f'{n:12} {len(big):>3}        {big}')
    tot[n]=len(big)
print('mean hues per screen:',round(sum(tot.values())/max(1,len(tot)),2))
