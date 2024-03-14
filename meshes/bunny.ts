import bunnyRawData from './bunnyData'
import { computeProjectedPlaneUVs, computeSurfaceNormals, generateNormals } from './utils';

const convertNumberArrToVec = (arr: number[], vec_size: 2 | 3 | 4) => {
  const newArr: number[][] = [];
  for (let i = 0; i < arr.length; i+= vec_size) {
    const ele = [];
    for (let j = 0; j < vec_size; j++) {
      ele.push(arr[i + j]);
    }
    newArr.push(ele);
  }
  switch(vec_size) {
    case 2: 
      return newArr as [number, number][]
    case 3: 
      return newArr as [number, number, number][]
    case 4: 
      return newArr as [number, number, number, number][]
  }
}

const convertToVec3Positions = (arr: number[]): [number, number, number][] => {
    const newArr: [number, number, number][] = [];
    for (let i = 0; i < arr.length; i+= 3) {
        newArr.push([
            arr[i] * 100, arr[i + 1] * 100, arr[i + 2] * 100
        ]);
    }
    return newArr;
}



const positions = convertToVec3Positions(bunnyRawData.positions);
const triangles = convertNumberArrToVec(bunnyRawData.indices, 3);
const tetEdgeIds = convertNumberArrToVec(bunnyRawData.tetEdgeIds, 2);
const tetVolumeIds = convertNumberArrToVec(bunnyRawData.tetIds, 4)
const normals = computeSurfaceNormals(positions, triangles as [number, number, number][]);
const uvs = computeProjectedPlaneUVs(positions, 'xy');
  
export const mesh = {
  positions,
  triangles,
  normals,
  uvs,
  tetEdgeIds,
  tetVolumeIds
};

