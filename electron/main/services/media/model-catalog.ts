import models from '../../../../resources/media/models.json'
import lock from '../../../../resources/media/binaries.lock.json'
export const MODEL_CATALOG=models
export const CUDA_ASSET=lock.cuda
export function catalogModel(id:string){const model=MODEL_CATALOG.find(m=>m.id===id);if(!model)throw Error('未知模型');return model}
