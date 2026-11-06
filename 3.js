(() => {
  const scene = document.querySelector('.scene');
  const card = document.querySelector('.floating-card');
  const orbOne = document.querySelector('.orb-one');
  const orbTwo = document.querySelector('.orb-two');

  if (!scene || !card) return;

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const state = {
    pointerX: 0,
    pointerY: 0,
    targetX: 0,
    targetY: 0,
    baseRotateX: 16,
    baseRotateY: -12,
    drift: 0,
  };

  const updateMotion = () => {
    state.pointerX += (state.targetX - state.pointerX) * 0.08;
    state.pointerY += (state.targetY - state.pointerY) * 0.08;
    state.drift += 0.018;

    const rotateY = state.baseRotateY + state.pointerX * 18;
    const rotateX = state.baseRotateX - state.pointerY * 16;
    const floatY = Math.sin(state.drift) * 10;
    const floatX = Math.cos(state.drift * 1.1) * 8;

    scene.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg) translate3d(${floatX}px, ${floatY}px, 0)`;
    card.style.transform = `translate3d(${state.pointerX * 16}px, ${state.pointerY * 14 + floatY}px, 160px) rotateX(${state.pointerY * -8}deg) rotateY(${state.pointerX * 10}deg)`;

    if (orbOne) {
      orbOne.style.transform = `translate3d(${state.pointerX * 18}px, ${state.pointerY * 12}px, 80px) scale(${1 + Math.sin(state.drift) * 0.06})`;
    }

    if (orbTwo) {
      orbTwo.style.transform = `translate3d(${state.pointerX * -12}px, ${state.pointerY * -10}px, 90px) scale(${1 + Math.cos(state.drift * 1.4) * 0.07})`;
    }

    requestAnimationFrame(updateMotion);
  };

  if (prefersReducedMotion) {
    scene.style.transform = 'rotateX(14deg) rotateY(-10deg)';
    card.style.transform = 'translate3d(0, 0, 160px)';
    return;
  }

  window.addEventListener('pointermove', (event) => {
    const x = (event.clientX / window.innerWidth) * 2 - 1;
    const y = (event.clientY / window.innerHeight) * 2 - 1;
    state.targetX = x;
    state.targetY = y;
  });

  window.addEventListener('pointerleave', () => {
    state.targetX = 0;
    state.targetY = 0;
  });

  requestAnimationFrame(updateMotion);
})();
