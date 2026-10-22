'use strict';
const assert=require('assert/strict'),fs=require('fs/promises'),os=require('os'),path=require('path'),Zip=require('jszip');
const video=require('../renderer/video-block'),slides=require('../renderer/slides'),{buildPresentation}=require('../electron/slidesExport'),{rebaseReferences}=require('../electron/fileBrowser');
(async()=>{
 for(const url of ['https://youtu.be/M7lc1UVf-VE','https://www.youtube.com/watch?v=M7lc1UVf-VE','https://www.youtube.com/shorts/M7lc1UVf-VE','https://www.youtube-nocookie.com/embed/M7lc1UVf-VE','M7lc1UVf-VE'])assert.equal(video.parse(`[youtube:${url}]`).id,'M7lc1UVf-VE');
 assert.equal(video.parse('[youtube:https://youtu.be/M7lc1UVf-VE?t=1m30s]').start,90);
 assert.equal(video.parse('[youtube:https://youtu.be/M7lc1UVf-VE?t=90]{start=12 width=4in}').start,12);
 for(const value of ['https://youtube.com.evil.test/watch?v=M7lc1UVf-VE','javascript:alert(1)','https://example.com/embed/M7lc1UVf-VE','https://youtube.com/watch?v=invalid'])assert.ok(video.parse(`[youtube:${value}]`).error);
 for(const value of ['/etc/video.mp4','file:///tmp/video.mp4','https://server/video.mp4','%2fetc/video.mp4','C:%5cvideo.mp4','video.txt','bad%00.mp4'])assert.ok(video.parse(`[video:${value}]`).error);
 assert.ok(!video.parse('[video:../media/my%20clip.webm]').error);assert.ok(video.parse('[video:clip.mp4]{width=0in}').error);
 assert.match(video.markup(video.parse('[youtube:M7lc1UVf-VE]')),/youtube-load/);assert.ok(!video.markup(video.parse('[youtube:M7lc1UVf-VE]')).includes('<iframe'));
 assert.match(video.markup(video.parse('[video:clip.mp4]'),()=>null),/Video not found/);
 const source='---\ntype: slides\n---\n# Local video\n\n[video:video.webm]{width=6in}\n\n---\n[youtube:M7lc1UVf-VE]{start=12}';const deck=slides.parse(source);assert.equal(slides.scene(deck,0).elements.filter(e=>e.type==='video').length,1);assert.equal(slides.scene(deck,0).elements.find(e=>e.type==='video').w,6);
 const fenced=slides.parse('---\ntype: slides\n---\n```\n[video:video.webm]\n```');assert.equal(slides.scene(fenced,0).elements.filter(e=>e.type==='video').length,0);
 assert.equal(rebaseReferences('[video:clips/test.mp4]\n`[video:clips/test.mp4]`','/work/lesson.md','/work/unit/lesson.md'),'[video:../clips/test.mp4]\n`[video:clips/test.mp4]`');
 const {buffer}=await buildPresentation(source,{root:path.resolve(__dirname,'fixtures')});const zip=await Zip.loadAsync(buffer);assert.ok(Object.keys(zip.files).some(name=>/ppt\/media\/.*\.webm$/.test(name)));assert.match(await zip.file('ppt/slides/slide1.xml').async('string'),/videoFile/);assert.match(await zip.file('ppt/slides/_rels/slide2.xml.rels').async('string'),/youtube.com/);
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'video-root-'));try{await fs.symlink(path.resolve(__dirname,'fixtures/video.webm'),path.join(temp,'outside.webm'));await assert.rejects(buildPresentation('---\ntype: slides\n---\n[video:outside.webm]',{root:temp}),/outside the open folder/);}finally{await fs.rm(temp,{recursive:true,force:true});}
 console.log('Video syntax validation, slide geometry, native PowerPoint media, and file boundaries passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
