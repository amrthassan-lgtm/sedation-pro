import { ref } from 'vue';

/**
 * True while a protocol page's large title has scrolled under the top bar.
 * The page sets it and the bar reads it, the way an iOS navigation bar shows
 * the title only once the large one has gone: never the same name twice on
 * screen. The page clears it when it closes.
 */
export const protocolTitleHidden = ref(false);
