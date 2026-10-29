import {traceImage} from './image-tracing.js';
self.onmessage=({data})=>{try{self.postMessage({result:traceImage(data.image,data.settings)});}catch(error){self.postMessage({error:error.message||'Could not trace this image.'});}};
