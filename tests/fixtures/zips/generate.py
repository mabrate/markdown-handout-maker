
import zipfile,sys,os,stat,struct
root=os.path.dirname(__file__)
def make(name, entries, compression=zipfile.ZIP_DEFLATED):
 with zipfile.ZipFile(os.path.join(root,name+'.zip'),'w',compression=compression) as z:
  for filename,data in entries: z.writestr(filename,data)
make('Lesson', [('nested/', ''), ('nested/Lesson.md','# Lesson'), ('data.csv','Name,Score\nAda,10'), ('café.txt','Unicode')])
make('stored', [('readme.txt','Stored')],zipfile.ZIP_STORED)
make('traversal', [('../escape.txt','bad')])
make('absolute', [('/escape.txt','bad')])
make('duplicate', [('a.txt','one'),('A.txt','two')])
with zipfile.ZipFile(os.path.join(root,'symlink.zip'),'w') as z:
 entry=zipfile.ZipInfo('link');entry.create_system=3;entry.external_attr=(stat.S_IFLNK | 0o777)<<16;z.writestr(entry,'../outside')
make('conflict',[('a','file'),('a/b','child')])
make('corrupt',[('a.txt','Original')],zipfile.ZIP_STORED)
p=os.path.join(root,'corrupt.zip');data=open(p,'rb').read().replace(b'Original',b'Changed!');open(p,'wb').write(data)
make('huge',[('a.txt','tiny')]);p=os.path.join(root,'huge.zip');data=bytearray(open(p,'rb').read());i=data.index(b'PK\x01\x02');struct.pack_into('<I',data,i+24,600*1024*1024);open(p,'wb').write(data)
