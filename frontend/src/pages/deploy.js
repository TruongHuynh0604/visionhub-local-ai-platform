import { Topbar } from '../components/topbar.js';
export function DeployPage() {
  return `${Topbar('Deploy', 'Deployment placeholder for local inference endpoint, ONNX/TensorRT export and camera runtime.')}
  <section class="card pad stack"><h2>Next local deployment modules</h2><ul><li>ONNX/TensorRT export command builder</li><li>Local inference API</li><li>Camera test panel</li><li>PLC result bridge</li></ul></section>`;
}
export function bindDeployPage() {}
