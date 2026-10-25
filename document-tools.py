import sys,json,zipfile,re,html,xml.etree.ElementTree as ET
from pathlib import Path
mode,source=sys.argv[1:3]
if mode=='extract':
    name=sys.argv[3].lower();pages=[]
    with zipfile.ZipFile(source) as z:
        if name.endswith('.pptx'):
            files=sorted((n for n in z.namelist() if re.fullmatch(r'ppt/slides/slide\d+\.xml',n)),key=lambda n:int(re.search(r'slide(\d+)',n).group(1)))
        elif name.endswith('.docx'): files=['word/document.xml']
        else: raise ValueError('Use DOCX or PPTX; export older DOC/PPT to PDF first.')
        for n in files:
            if z.getinfo(n).file_size>15000000: raise ValueError('Document part is too large')
            tree=ET.fromstring(z.read(n));texts=[e.text for e in tree.iter() if e.tag.endswith('}t') and e.text]
            pages.append('\n'.join(texts))
    print(json.dumps({'pages':pages,'name':sys.argv[3]}))
elif mode=='anki':
    import genanki,hashlib
    data=json.loads(Path(source).read_text());name=str(data.get('name','Recall Lab'));deckid=int(hashlib.sha256(name.encode()).hexdigest()[:8],16)
    model=genanki.Model(1607392319,'Recall Lab Basic',fields=[{'name':'Question'},{'name':'Answer'},{'name':'Source'}],templates=[{'name':'Card 1','qfmt':'{{Question}}','afmt':'{{FrontSide}}<hr id="answer">{{Answer}}<hr>{{Source}}'}],css='.card{font-family:Arial;font-size:20px;text-align:left;color:#172c2a;background:#fff;padding:20px}')
    cloze=genanki.Model(1607392320,'Recall Lab Cloze',fields=[{'name':'Text'},{'name':'Extra'},{'name':'Source'}],templates=[{'name':'Cloze','qfmt':'{{cloze:Text}}','afmt':'{{cloze:Text}}<hr>{{Extra}}<hr>{{Source}}'}],model_type=genanki.Model.CLOZE)
    deck=genanki.Deck(deckid,name)
    for c in data.get('cards',[]):
        fields=[html.escape(str(c.get(k,''))).replace('\n','<br>') for k in ['front','back','source']]
        chosen=model
        if c.get('type')=='cloze':
            chosen=cloze
            fields=[fields[0].replace('____','{{c1::'+fields[1]+'}}',1) if '____' in fields[0] else fields[0]+' {{c1::'+fields[1]+'}}','',fields[2]]
        elif c.get('mc'):
            fields[0]+='<br><br>'+'<br>'.join(html.escape(str(o)) for o in [c['mc'].get('a','')]+c['mc'].get('wrong',[]))
        deck.add_note(genanki.Note(model=chosen,fields=fields,guid=genanki.guid_for(name,c.get('id'),c.get('front'),c.get('back'))))
    genanki.Package(deck).write_to_file(sys.argv[3])
