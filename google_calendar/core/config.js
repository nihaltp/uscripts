export const config = {
  get hideOriginals() {
    return localStorage.getItem('gcal-hide-original') === 'true';
  },
  set hideOriginals(value) {
    localStorage.setItem('gcal-hide-original', value ? 'true' : 'false');
  }
};
