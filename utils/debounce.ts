const debounce = <Args extends readonly unknown[], F extends (...args: Args) => void>(
  func: F,
  wait: number
): (...args: Args) => void => {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  return function (...args: Args) {
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => {
      func(...args);
    }, wait);
  };
};

export default debounce;
