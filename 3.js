(() => {
  const scene = document.querySelector('.scene');
  const card = document.querySelector('.floating-card');
  const orbOne = document.querySelector('.orb-one');
  const orbTwo = document.querySelector('.orb-two');
  const signalCard = document.querySelector('.signal-card');

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
    pointerActive: false,
  };

  const getAutoTarget = (time) => ({
    x: Math.sin(time * 0.0012) * 0.9,
    y: Math.cos(time * 0.0017) * 0.8,
  });

  const updateMotion = (time) => {
    const autoTarget = getAutoTarget(time);
    const targetX = state.pointerActive ? state.targetX : autoTarget.x;
    const targetY = state.pointerActive ? state.targetY : autoTarget.y;

    state.pointerX += (targetX - state.pointerX) * 0.08;
    state.pointerY += (targetY - state.pointerY) * 0.08;
    state.drift += 0.022;

    const rotateY = state.baseRotateY + state.pointerX * 18;
    const rotateX = state.baseRotateX - state.pointerY * 16;
    const floatY = Math.sin(state.drift) * 12;
    const floatX = Math.cos(state.drift * 1.1) * 10;

    scene.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg) translate3d(${floatX}px, ${floatY}px, 0)`;
    card.style.transform = `translate3d(${state.pointerX * 22}px, ${state.pointerY * 18 + floatY}px, 160px) rotateX(${state.pointerY * -10}deg) rotateY(${state.pointerX * 12}deg)`;

    if (signalCard) {
      signalCard.style.transform = `translate3d(${state.pointerX * 14}px, ${state.pointerY * 10}px, 170px) rotateY(${state.pointerX * -12}deg) rotateX(${state.pointerY * 8}deg)`;
    }

    if (orbOne) {
      orbOne.style.transform = `translate3d(${state.pointerX * 30}px, ${state.pointerY * 18}px, 80px) scale(${1 + Math.sin(state.drift) * 0.12})`;
    }

    if (orbTwo) {
      orbTwo.style.transform = `translate3d(${state.pointerX * -18}px, ${state.pointerY * -16}px, 90px) scale(${1 + Math.cos(state.drift * 1.4) * 0.14})`;
    }

    requestAnimationFrame(updateMotion);
  };

  if (prefersReducedMotion) {
    scene.style.transform = 'rotateX(14deg) rotateY(-10deg)';
    card.style.transform = 'translate3d(0, 0, 160px)';
    if (signalCard) signalCard.style.transform = 'translate3d(0,0,170px)';
    return;
  }

  window.addEventListener('pointermove', (event) => {
    state.pointerActive = true;
    const x = (event.clientX / window.innerWidth) * 2 - 1;
    const y = (event.clientY / window.innerHeight) * 2 - 1;
    state.targetX = x;
    state.targetY = y;
  });

  window.addEventListener('pointerleave', () => {
    state.pointerActive = false;
    state.targetX = 0;
    state.targetY = 0;
  });

  requestAnimationFrame(updateMotion);
})();
