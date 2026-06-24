export const state = {
  route: location.hash.replace('#/', '') || 'home',
  projects: [],
  selectedProjectId: localStorage.getItem('vh_project_id') || '',
  classes: [],
  images: [],
  currentImageIndex: 0,
  currentTask: localStorage.getItem('vh_task') || 'Detection',
  storageMode: localStorage.getItem('vh_storage_mode') || 'server',
  localRootHandle: null,
  localRootName: localStorage.getItem('vh_local_root_name') || '',
  localFsReady: false,
  localFsStatus: '',
};

export function setRoute(route) {
  state.route = route || 'home';
  location.hash = `/${state.route}`;
}

export function setProject(projectId) {
  state.selectedProjectId = projectId;
  localStorage.setItem('vh_project_id', projectId || '');
}

export function setTask(task) {
  state.currentTask = task;
  localStorage.setItem('vh_task', task);
}

export function setStorageMode(mode) {
  state.storageMode = mode || 'server';
  localStorage.setItem('vh_storage_mode', state.storageMode);
}
