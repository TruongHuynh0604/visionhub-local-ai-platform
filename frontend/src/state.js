export const state = {
  route: location.hash.replace('#/', '') || 'home',
  projects: [],
  selectedProjectId: localStorage.getItem('vh_local_active_project_id') || localStorage.getItem('vh_project_id') || 'default-project',
  classes: [],
  images: [],
  currentImageIndex: 0,
  currentTask: localStorage.getItem('vh_task') || 'Detection',
  storageMode: 'local',
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
  state.selectedProjectId = projectId || 'default-project';
  localStorage.setItem('vh_project_id', state.selectedProjectId);
  localStorage.setItem('vh_local_active_project_id', state.selectedProjectId);
}

export function setTask(task) {
  state.currentTask = task;
  localStorage.setItem('vh_task', task);
}

export function setStorageMode() {
  state.storageMode = 'local';
  localStorage.setItem('vh_storage_mode', 'local');
}
