'use strict';
const assert=require('assert/strict'),slides=require('../renderer/slides');
function move(source,from,to){const edit=slides.reorderEdit(source,from,to);assert.ok(edit);return source.slice(0,edit.start)+edit.text+source.slice(edit.end);}
const header='---\ntype: slides\ntheme: dark\nname: Garden lesson\n---\n';
const first='# First\n\n```md\n---\n:::notes\n```\n\n:::notes\nPrivate first\n---\nMore first notes\n:::\n\n';
const second='\n# Second\n\n:::columns\n:::column\nOne\n:::column\n![Example](images/plant.png){width=3in}\n:::\n\n:::notes\nPrivate second\n:::\n';
const third='\n# Third\n\n[video:media/clip.mp4]\n\nLast without newline';
const source=header+first+'---\n'+second+'---\n'+third;
const result=move(source,0,2),deck=slides.parse(result);assert.equal(deck.slides.length,3);assert.deepEqual(deck.slides.map(slide=>slides.plain(slide.title)),['Second','Third','First']);assert.equal(result.slice(0,header.length),header);assert.equal(deck.slides[0].notes,'Private second');assert.equal(deck.slides[2].notes,'Private first\n---\nMore first notes');assert.ok(result.includes(first));assert.ok(result.includes(second));assert.ok(result.includes(third));assert.equal((result.match(/type: slides/g)||[]).length,1);
const toFirst=move(source,2,0);assert.equal(slides.plain(slides.parse(toFirst).slides[0].title),'Third');assert.match(toFirst,/Last without newline\n---\n/);assert.ok(toFirst.includes('images/plant.png'));assert.ok(toFirst.includes('media/clip.mp4'));
const windows=source.replace(/\n/g,'\r\n'),windowsMove=move(windows,1,0);assert.equal(windowsMove.replace(/\r\n/g,'').includes('\n'),false);assert.deepEqual(slides.parse(windowsMove).slides.map(slide=>slides.plain(slide.title)),['Second','First','Third']);
const empty=header+'# A\n---\n\n---\n# B';assert.equal(slides.parse(move(empty,1,0)).slides.length,3,'Empty slides stay present');
for(const pair of [[0,0],[-1,0],[0,3],[.5,1]])assert.equal(slides.reorderEdit(source,...pair),null);assert.equal(slides.reorderEdit('# Handout',0,1),null);assert.equal(slides.reorderEdit(header+'# A\n---\n# B\n:::notes\nUnclosed',0,1),null);
console.log('Slide reordering preserves YAML, full content, private notes, fenced separators, media paths, empty slides and CRLF');
