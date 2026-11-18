import './style.css';
import '@kitware/vtk.js/Rendering/Profiles/Volume';
import vtkGenericRenderWindow from '@kitware/vtk.js/Rendering/Misc/GenericRenderWindow';
import vtkVolume from '@kitware/vtk.js/Rendering/Core/Volume';
import vtkVolumeMapper from '@kitware/vtk.js/Rendering/Core/VolumeMapper';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import vtkPiecewiseFunction from '@kitware/vtk.js/Common/DataModel/PiecewiseFunction';
import vtkImageMapper from '@kitware/vtk.js/Rendering/Core/ImageMapper';
import vtkImageSlice from '@kitware/vtk.js/Rendering/Core/ImageSlice';
import { SlicingMode } from '@kitware/vtk.js/Rendering/Core/ImageMapper/Constants';
import { gunzipSync } from 'fflate';
import { DEFAULT_NRRD_URL } from './config.js';

const $ = (id) => document.getElementById(id);
const status = (msg) => { $('status').textContent = msg; };
const render3d = vtkGenericRenderWindow.newInstance({ background: [0.035,0.055,0.072] });
render3d.setContainer($('volume-view')); render3d.resize();
const render2d = vtkGenericRenderWindow.newInstance({ background: [0.035,0.055,0.072] });
render2d.setContainer($('slice-view')); render2d.resize();
const renderer3d = render3d.getRenderer(), renderer2d = render2d.getRenderer();
let volume = null, sliceActor = null, image = null, dataRange = [0,1], sliceMapper = null;
let volumeCTF, volumeOpacity;
const refresh = () => { render3d.getRenderWindow().render(); render2d.getRenderWindow().render(); };
new ResizeObserver(() => { render3d.resize(); render2d.resize(); }).observe($('app'));

function parseNrrd(buffer) {
  const bytes = new Uint8Array(buffer);
  if (new TextDecoder().decode(bytes.subarray(0, 4)) !== 'NRRD') throw new Error('This does not appear to be a NRRD file.');
  let end = -1, separatorLength = 0;
  for (let i=0; i<Math.min(bytes.length, 32768)-1; i++) {
    if(bytes[i]===10 && bytes[i+1]===10){end=i;separatorLength=2;break;}
    if(bytes[i]===13 && bytes[i+1]===10 && bytes[i+2]===13 && bytes[i+3]===10){end=i;separatorLength=4;break;}
  }
  if(end<0) throw new Error('Could not locate the NRRD header ending.');
  const header = new TextDecoder().decode(bytes.subarray(0,end));
  const fields = {};
  for(const line of header.split(/\r?\n/)){
    const match=line.match(/^([^:#][^:]*):\s*(.*)$/);
    if(match) fields[match[1].trim().toLowerCase()] = match[2].trim();
  }
  const dimensions = (fields.sizes || '').split(/\s+/).map(Number);
  if(fields.dimension !== '3' || dimensions.length!==3 || dimensions.some(x=>!Number.isInteger(x)||x<1)) throw new Error('Only 3D scalar NRRD volumes are supported.');
  if(fields['data file'] || fields.datafile) throw new Error('Detached NRRD (.nhdr) is not supported; save a single .nrrd from Slicer.');
  const types = {
    'uchar':Uint8Array,'unsigned char':Uint8Array,'uint8':Uint8Array,'uint8_t':Uint8Array,
    'char':Int8Array,'signed char':Int8Array,'int8':Int8Array,'int8_t':Int8Array,
    'short':Int16Array,'short int':Int16Array,'int16':Int16Array,'int16_t':Int16Array,
    'ushort':Uint16Array,'unsigned short':Uint16Array,'uint16':Uint16Array,'uint16_t':Uint16Array,
    'int':Int32Array,'int32':Int32Array,'int32_t':Int32Array,
    'uint':Uint32Array,'unsigned int':Uint32Array,'uint32':Uint32Array,'uint32_t':Uint32Array,
    'float':Float32Array,'double':Float64Array,
  };
  const DataType=types[(fields.type||'').toLowerCase()];
  if(!DataType) throw new Error('Unsupported NRRD type: '+fields.type);
  const encoding=(fields.encoding||'raw').toLowerCase();
  let payload=bytes.subarray(end+separatorLength);
  if(encoding==='gzip'||encoding==='gz') payload=gunzipSync(payload);
  else if(encoding!=='raw') throw new Error('Unsupported NRRD encoding: '+encoding);
  const count=dimensions.reduce((a,b)=>a*b,1);
  const size=DataType.BYTES_PER_ELEMENT;
  if(payload.byteLength<count*size) throw new Error('NRRD data is shorter than expected.');
  // Explicit DataView conversion prevents typed-array alignment issues and handles endian values.
  let data;
  if(size===1) data=new DataType(payload.slice(0,count));
  else {
    const little=(fields.endian||'little').toLowerCase()!=='big';
    const view=new DataView(payload.buffer,payload.byteOffset,payload.byteLength);
    const readName = new Map([[Int16Array,'getInt16'],[Uint16Array,'getUint16'],[Int32Array,'getInt32'],[Uint32Array,'getUint32'],[Float32Array,'getFloat32'],[Float64Array,'getFloat64']]).get(DataType);
    data=new DataType(count);
    for(let i=0;i<count;i++) data[i]=view[readName](i*size,little);
  }
  let spacing=[1,1,1], direction=[1,0,0,0,1,0,0,0,1];
  const dirMatches=(fields['space directions']||'').match(/\([^)]*\)|none/g);
  if(dirMatches?.length===3 && !dirMatches.includes('none')){
    const columns=dirMatches.map(s=>s.slice(1,-1).split(',').map(Number));
    spacing=columns.map(c=>Math.hypot(...c));
    direction=[columns[0][0]/spacing[0],columns[1][0]/spacing[1],columns[2][0]/spacing[2],columns[0][1]/spacing[0],columns[1][1]/spacing[1],columns[2][1]/spacing[2],columns[0][2]/spacing[0],columns[1][2]/spacing[1],columns[2][2]/spacing[2]];
  } else if(fields.spacings){spacing=fields.spacings.split(/\s+/).map(Number);}
  let origin=[0,0,0];
  const om=(fields['space origin']||'').match(/\(([^)]+)\)/);
  if(om) origin=om[1].split(',').map(Number);
  const vtkImg=vtkImageData.newInstance();
  vtkImg.setDimensions(...dimensions);vtkImg.setSpacing(...spacing);vtkImg.setOrigin(...origin);vtkImg.setDirection(direction);
  vtkImg.getPointData().setScalars(vtkDataArray.newInstance({name:'CT',values:data,numberOfComponents:1}));
  return {vtkImg,dimensions,data};
}
function rangeOf(data){let low=Infinity,high=-Infinity; for(let i=0;i<data.length;i++){let v=data[i]; if(Number.isFinite(v)){if(v<low)low=v;if(v>high)high=v;}}return [low,high>low?high:low+1];}
function updateTransfer(){
  if(!volume) return;
  const [low,high]=dataRange, center=(low+high)/2;
  const fraction=Number($('window').value)/100, width=(high-low)*fraction;
  const a=center-width/2,b=center+width/2, alpha=Number($('opacity').value);
  $('opacity-value').textContent=alpha.toFixed(2);$('window-value').textContent=Math.round(fraction*100)+'%';
  volumeCTF.removeAllPoints();volumeCTF.addRGBPoint(a,0.07,0.055,0.042);volumeCTF.addRGBPoint(a+(b-a)*.35,0.45,0.29,0.16);volumeCTF.addRGBPoint(b,0.97,0.85,0.63);
  volumeOpacity.removeAllPoints();volumeOpacity.addPoint(a,0);volumeOpacity.addPoint(a+(b-a)*0.1,0);volumeOpacity.addPoint(a+(b-a)*0.55,alpha*.15);volumeOpacity.addPoint(b,alpha);
  if(sliceActor){const prop=sliceActor.getProperty();prop.setColorWindow(width);prop.setColorLevel(center);}
  refresh();
}
async function load(url){
  $('load').disabled=true; status('Downloading CT data… (a ~80 MB file may take some time)');
  try{
    const response=await fetch(url);
    if(!response.ok) throw new Error('HTTP '+response.status+' fetching CT file');
    const buffer=await response.arrayBuffer(); status('Decompressing / reading NRRD data…');
    await new Promise(r=>setTimeout(r,30));
    const {vtkImg,dimensions,data}=parseNrrd(buffer);
    image=vtkImg; dataRange=rangeOf(data);
    if(volume) renderer3d.removeVolume(volume);
    if(sliceActor) renderer2d.removeViewProp(sliceActor);
    const mapper=vtkVolumeMapper.newInstance();mapper.setInputData(image);mapper.setSampleDistance(Math.max(...image.getSpacing())*0.75);
    volume=vtkVolume.newInstance();volume.setMapper(mapper);
    volumeCTF=vtkColorTransferFunction.newInstance();volumeOpacity=vtkPiecewiseFunction.newInstance();
    volume.getProperty().setRGBTransferFunction(0,volumeCTF);volume.getProperty().setScalarOpacity(0,volumeOpacity);
    volume.getProperty().setScalarOpacityUnitDistance(0,Math.max(...image.getSpacing())*2);
    volume.getProperty().setShade(true);volume.getProperty().setAmbient(.27);volume.getProperty().setDiffuse(.70);volume.getProperty().setSpecular(.15);
    renderer3d.addVolume(volume);
    sliceMapper=vtkImageMapper.newInstance();sliceMapper.setInputData(image);sliceMapper.setSlicingMode(SlicingMode.K);
    sliceActor=vtkImageSlice.newInstance();sliceActor.setMapper(sliceMapper);renderer2d.addViewProp(sliceActor);
    const slider=$('slice');slider.disabled=false;slider.max=String(dimensions[2]-1);slider.value=String(Math.floor(dimensions[2]/2));sliceMapper.setSlice(Number(slider.value));$('slice-value').textContent=`${slider.value} / ${slider.max}`;
    updateTransfer();renderer3d.resetCamera();renderer2d.resetCamera();
    // Point at the middle of the slice, with an overhead camera.
    const camera=renderer2d.getActiveCamera(),bounds=image.getBounds();
    const middle=[(bounds[0]+bounds[1])/2,(bounds[2]+bounds[3])/2,(bounds[4]+bounds[5])/2];
    camera.setFocalPoint(...middle);camera.setPosition(middle[0],middle[1],middle[2]+Math.max(bounds[1]-bounds[0],bounds[3]-bounds[2],bounds[5]-bounds[4])*2);
    camera.setViewUp(0,1,0);camera.setParallelProjection(true);renderer2d.resetCamera();refresh();
    status(`CT loaded successfully · ${dimensions.join(' × ')} voxels · values ${dataRange[0]} to ${dataRange[1]}`);
  }catch(e){console.error(e);status('Error: '+e.message+' (check public access, CORS, and NRRD encoding)');}
  finally{$('load').disabled=false;}
}
$('load').addEventListener('click',()=>{const url=$('volume-url').value.trim();if(url)load(url);else status('Please enter a public NRRD file URL.');});
$('opacity').addEventListener('input',updateTransfer);$('window').addEventListener('input',updateTransfer);
$('slice').addEventListener('input',()=>{if(!sliceMapper)return;sliceMapper.setSlice(Number($('slice').value));$('slice-value').textContent=`${$('slice').value} / ${$('slice').max}`;refresh();});
$('reset').addEventListener('click',()=>{renderer3d.resetCamera();renderer2d.resetCamera();refresh();});
if(DEFAULT_NRRD_URL){$('volume-url').value=DEFAULT_NRRD_URL;load(DEFAULT_NRRD_URL);}
