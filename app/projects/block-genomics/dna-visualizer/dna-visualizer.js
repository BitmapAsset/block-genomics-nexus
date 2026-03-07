/**
 * Block Genomics - 3D DNA Visualizer
 * A stunning interactive DNA helix visualization using Three.js
 * 
 * @author Block Genomics Team
 * @version 1.0.0
 */

class DNAVisualizer {
  constructor(container, options = {}) {
    this.container = typeof container === 'string' 
      ? document.querySelector(container) 
      : container;
    
    this.options = {
      genomeHash: 'a3f8c2e91b4d6f0785c3e2a19b7d4f6e8c2a1b3d5f7e9c0b2a4d6f8e1c3b5a7d',
      basePairCount: 64,
      helixRadius: 2,
      helixHeight: 20,
      rotationSpeed: 0.003,
      particleCount: 200,
      enableBloom: true,
      enableParticles: true,
      ...options
    };

    // Animation states
    this.state = 'idle'; // idle, verifying, verified
    this.targetRotationSpeed = this.options.rotationSpeed;
    this.currentRotationSpeed = this.options.rotationSpeed;
    
    // Color palette for hex characters (0-F)
    this.colorPalette = {
      '0': '#ff0055', // Hot pink
      '1': '#ff3366', // Rose
      '2': '#ff6633', // Orange
      '3': '#ffaa00', // Gold
      '4': '#ccff00', // Lime
      '5': '#66ff33', // Green
      '6': '#00ff99', // Mint
      '7': '#00ffcc', // Cyan
      '8': '#00ccff', // Sky blue
      '9': '#0099ff', // Blue
      'a': '#3366ff', // Royal blue
      'b': '#6633ff', // Purple
      'c': '#9933ff', // Violet
      'd': '#cc33ff', // Magenta
      'e': '#ff33cc', // Pink
      'f': '#ff3399'  // Fuchsia
    };

    this.init();
  }

  init() {
    this.setupScene();
    this.setupCamera();
    this.setupRenderer();
    this.setupLights();
    this.setupPostProcessing();
    this.createDNA();
    this.createParticles();
    this.setupControls();
    this.setupEventListeners();
    this.animate();
  }

  setupScene() {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x0a0a0f, 0.02);
  }

  setupCamera() {
    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000);
    this.camera.position.set(0, 0, 15);
    this.camera.lookAt(0, 0, 0);
  }

  setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({ 
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x0a0a0f, 1);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.container.appendChild(this.renderer.domElement);
  }

  setupLights() {
    // Ambient light
    const ambient = new THREE.AmbientLight(0x222244, 0.5);
    this.scene.add(ambient);

    // Main directional light
    const mainLight = new THREE.DirectionalLight(0xffffff, 1);
    mainLight.position.set(10, 10, 10);
    this.scene.add(mainLight);

    // Accent lights for color
    const blueLight = new THREE.PointLight(0x0066ff, 2, 30);
    blueLight.position.set(-10, 5, 5);
    this.scene.add(blueLight);

    const pinkLight = new THREE.PointLight(0xff0066, 2, 30);
    pinkLight.position.set(10, -5, 5);
    this.scene.add(pinkLight);

    // Store for animations
    this.lights = { blueLight, pinkLight };
  }

  setupPostProcessing() {
    if (!this.options.enableBloom || typeof THREE.EffectComposer === 'undefined') {
      this.useComposer = false;
      return;
    }

    this.useComposer = true;
    
    // Render pass
    const renderPass = new THREE.RenderPass(this.scene, this.camera);
    
    // Bloom pass
    this.bloomPass = new THREE.UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.8,  // strength
      0.4,  // radius
      0.85  // threshold
    );

    // Composer
    this.composer = new THREE.EffectComposer(this.renderer);
    this.composer.addPass(renderPass);
    this.composer.addPass(this.bloomPass);
  }

  createDNA() {
    this.dnaGroup = new THREE.Group();
    this.basePairs = [];
    this.backboneSpheres = [];
    
    const hash = this.options.genomeHash.toLowerCase();
    const basePairCount = this.options.basePairCount;
    const radius = this.options.helixRadius;
    const height = this.options.helixHeight;
    
    // Create backbone material
    const backboneMaterial = new THREE.MeshStandardMaterial({
      color: 0x4488aa,
      metalness: 0.5,
      roughness: 0.3,
      emissive: 0x112233,
      emissiveIntensity: 0.3
    });

    // Create base pairs
    for (let i = 0; i < basePairCount; i++) {
      const t = i / basePairCount;
      const y = (t - 0.5) * height;
      const angle = t * Math.PI * 6; // 3 full turns
      
      // Get color from hash
      const hexChar = hash[i % hash.length];
      const color = new THREE.Color(this.colorPalette[hexChar] || '#ffffff');
      
      // Strand 1 position
      const x1 = Math.cos(angle) * radius;
      const z1 = Math.sin(angle) * radius;
      
      // Strand 2 position (opposite side)
      const x2 = Math.cos(angle + Math.PI) * radius;
      const z2 = Math.sin(angle + Math.PI) * radius;

      // Create backbone spheres
      const sphereGeo = new THREE.SphereGeometry(0.15, 16, 16);
      
      const sphere1 = new THREE.Mesh(sphereGeo, backboneMaterial.clone());
      sphere1.position.set(x1, y, z1);
      this.dnaGroup.add(sphere1);
      this.backboneSpheres.push(sphere1);
      
      const sphere2 = new THREE.Mesh(sphereGeo, backboneMaterial.clone());
      sphere2.position.set(x2, y, z2);
      this.dnaGroup.add(sphere2);
      this.backboneSpheres.push(sphere2);

      // Create base pair connection
      const basePairMaterial = new THREE.MeshStandardMaterial({
        color: color,
        metalness: 0.3,
        roughness: 0.4,
        emissive: color,
        emissiveIntensity: 0.4,
        transparent: true,
        opacity: 0.9
      });

      // Create cylinder for base pair
      const distance = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(z2 - z1, 2));
      const basePairGeo = new THREE.CylinderGeometry(0.08, 0.08, distance, 8);
      basePairGeo.rotateX(Math.PI / 2);
      
      const basePair = new THREE.Mesh(basePairGeo, basePairMaterial);
      basePair.position.set((x1 + x2) / 2, y, (z1 + z2) / 2);
      basePair.lookAt(x1, y, z1);
      
      // Store data for interactions
      basePair.userData.originalColor = color.clone();
      basePair.userData.index = i;
      basePair.userData.hexValue = hexChar;
      basePair.userData.angle = angle;
      
      this.dnaGroup.add(basePair);
      this.basePairs.push(basePair);

      // Add glow spheres at connection points
      const glowGeo = new THREE.SphereGeometry(0.12, 12, 12);
      const glowMat = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.6
      });
      
      const glow1 = new THREE.Mesh(glowGeo, glowMat.clone());
      glow1.position.set(x1, y, z1);
      this.dnaGroup.add(glow1);
      
      const glow2 = new THREE.Mesh(glowGeo, glowMat.clone());
      glow2.position.set(x2, y, z2);
      this.dnaGroup.add(glow2);
    }

    // Create backbone tubes
    this.createBackboneTube(1);
    this.createBackboneTube(-1);

    this.scene.add(this.dnaGroup);
  }

  createBackboneTube(side) {
    const points = [];
    const basePairCount = this.options.basePairCount;
    const radius = this.options.helixRadius;
    const height = this.options.helixHeight;

    for (let i = 0; i <= basePairCount; i++) {
      const t = i / basePairCount;
      const y = (t - 0.5) * height;
      const angle = t * Math.PI * 6 + (side === -1 ? Math.PI : 0);
      
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      
      points.push(new THREE.Vector3(x, y, z));
    }

    const curve = new THREE.CatmullRomCurve3(points);
    const tubeGeo = new THREE.TubeGeometry(curve, 100, 0.06, 8, false);
    const tubeMat = new THREE.MeshStandardMaterial({
      color: 0x66aacc,
      metalness: 0.6,
      roughness: 0.2,
      emissive: 0x224466,
      emissiveIntensity: 0.3
    });

    const tube = new THREE.Mesh(tubeGeo, tubeMat);
    this.dnaGroup.add(tube);
  }

  createParticles() {
    if (!this.options.enableParticles) return;

    const particleCount = this.options.particleCount;
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const sizes = new Float32Array(particleCount);

    for (let i = 0; i < particleCount; i++) {
      // Random position in a sphere around the DNA
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 8 + Math.random() * 15;

      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = (Math.random() - 0.5) * 25;
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);

      // Random colors from palette
      const colorKeys = Object.keys(this.colorPalette);
      const randomColor = new THREE.Color(
        this.colorPalette[colorKeys[Math.floor(Math.random() * colorKeys.length)]]
      );
      colors[i * 3] = randomColor.r;
      colors[i * 3 + 1] = randomColor.g;
      colors[i * 3 + 2] = randomColor.b;

      sizes[i] = Math.random() * 0.1 + 0.02;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const material = new THREE.PointsMaterial({
      size: 0.08,
      vertexColors: true,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true
    });

    this.particles = new THREE.Points(geometry, material);
    this.scene.add(this.particles);
  }

  setupControls() {
    if (typeof THREE.OrbitControls !== 'undefined') {
      this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.05;
      this.controls.enablePan = false;
      this.controls.minDistance = 8;
      this.controls.maxDistance = 30;
      this.controls.autoRotate = false;
    }
  }

  setupEventListeners() {
    window.addEventListener('resize', () => this.onResize());
    
    // Click interaction
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    
    this.renderer.domElement.addEventListener('click', (e) => this.onClick(e));
    this.renderer.domElement.addEventListener('mousemove', (e) => this.onMouseMove(e));
  }

  onClick(event) {
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.basePairs);

    if (intersects.length > 0) {
      const basePair = intersects[0].object;
      this.highlightBasePair(basePair);
      this.showTooltip(basePair, event.clientX, event.clientY);
      this.triggerGlitch();
      
      // Emit custom event
      const customEvent = new CustomEvent('basepair-click', {
        detail: {
          index: basePair.userData.index,
          color: basePair.userData.originalColor,
          hexValue: basePair.userData.hexValue
        }
      });
      this.container.dispatchEvent(customEvent);
    } else {
      this.hideTooltip();
    }
  }

  onMouseMove(event) {
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    
    // Hover detection for cursor change
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.basePairs);
    this.renderer.domElement.style.cursor = intersects.length > 0 ? 'pointer' : 'grab';
  }

  showTooltip(basePair, x, y) {
    const tooltip = document.getElementById('bp-tooltip');
    if (!tooltip) return;
    
    const idx = basePair.userData.index;
    const hexChar = this.options.genomeHash[idx] || '0';
    const color = this.colorPalette[hexChar.toLowerCase()];
    const angle = Math.round((idx / this.options.basePairCount) * 360 * 3); // 3 full turns
    
    // Determine trait based on position (fun/demo logic)
    const traits = [
      'is_prime', 'is_palindrome', 'is_fibonacci', 'is_epic',
      'is_rare', 'is_satoshi', 'is_halving', 'is_genesis',
      'is_historic', 'is_billionaire', 'is_mythic', null
    ];
    const trait = idx % 7 === 0 ? traits[idx % traits.length] : null;
    
    // Update tooltip content
    document.getElementById('bp-color').style.backgroundColor = color;
    document.getElementById('bp-color').style.boxShadow = `0 0 15px ${color}`;
    document.getElementById('bp-title').textContent = `Nucleotide #${idx}`;
    document.getElementById('bp-hex').textContent = `0x${hexChar.toUpperCase()}`;
    document.getElementById('bp-position').textContent = `${idx + 1} / ${this.options.basePairCount}`;
    document.getElementById('bp-angle').textContent = `${angle}°`;
    document.getElementById('bp-trait').textContent = trait || '—';
    document.getElementById('bp-trait').classList.toggle('highlight', !!trait);
    
    // Position tooltip
    const offsetX = x + 20;
    const offsetY = y - 20;
    tooltip.style.left = Math.min(offsetX, window.innerWidth - 260) + 'px';
    tooltip.style.top = Math.min(offsetY, window.innerHeight - 200) + 'px';
    
    // Show tooltip
    tooltip.classList.add('visible');
  }
  
  hideTooltip() {
    const tooltip = document.getElementById('bp-tooltip');
    if (tooltip) tooltip.classList.remove('visible');
  }
  
  triggerGlitch() {
    const canvas = this.renderer.domElement;
    canvas.classList.add('glitch-active');
    setTimeout(() => canvas.classList.remove('glitch-active'), 300);
  }

  highlightBasePair(basePair) {
    // Flash effect with enhanced glow
    const originalEmissive = basePair.material.emissiveIntensity;
    basePair.material.emissiveIntensity = 3;
    
    // Scale pop effect
    const originalScale = basePair.scale.clone();
    basePair.scale.multiplyScalar(1.3);
    
    setTimeout(() => {
      basePair.material.emissiveIntensity = originalEmissive;
      basePair.scale.copy(originalScale);
    }, 250);
  }

  onResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height);
    
    if (this.useComposer) {
      this.composer.setSize(width, height);
    }
  }

  // Animation States
  setState(newState) {
    this.state = newState;
    
    switch (newState) {
      case 'idle':
        this.targetRotationSpeed = this.options.rotationSpeed;
        if (this.bloomPass) this.bloomPass.strength = 0.8;
        this.hideTooltip();
        break;
        
      case 'verifying':
        this.targetRotationSpeed = this.options.rotationSpeed * 5;
        if (this.bloomPass) this.bloomPass.strength = 1.5;
        this.startVerificationAnimation();
        this.triggerGlitchBurst();
        this.hideTooltip();
        break;
        
      case 'verified':
        this.targetRotationSpeed = this.options.rotationSpeed * 0.5;
        if (this.bloomPass) this.bloomPass.strength = 2;
        this.startSuccessAnimation();
        this.triggerSuccessFlash();
        break;
    }

    // Emit state change event
    const event = new CustomEvent('state-change', { detail: { state: newState } });
    this.container.dispatchEvent(event);
  }
  
  triggerGlitchBurst() {
    // Apply glitch burst to the app container
    const app = document.getElementById('app');
    if (app) {
      app.classList.add('glitch-burst');
      setTimeout(() => app.classList.remove('glitch-burst'), 500);
    }
    
    // Rapid random glitches during verification
    let glitchCount = 0;
    const maxGlitches = 8;
    const glitchInterval = setInterval(() => {
      if (glitchCount >= maxGlitches || this.state !== 'verifying') {
        clearInterval(glitchInterval);
        return;
      }
      this.triggerGlitch();
      glitchCount++;
    }, 200 + Math.random() * 300);
  }
  
  triggerSuccessFlash() {
    // Create and animate success flash overlay
    const flash = document.createElement('div');
    flash.className = 'success-flash';
    document.body.appendChild(flash);
    
    setTimeout(() => {
      flash.remove();
    }, 700);
  }

  startVerificationAnimation() {
    // Pulse colors during verification
    this.verificationInterval = setInterval(() => {
      if (this.state !== 'verifying') {
        clearInterval(this.verificationInterval);
        return;
      }

      this.basePairs.forEach((bp, i) => {
        const pulse = Math.sin(Date.now() * 0.01 + i * 0.2) * 0.5 + 0.5;
        bp.material.emissiveIntensity = 0.4 + pulse * 0.6;
      });
    }, 16);
  }

  startSuccessAnimation() {
    // Clear verification interval
    if (this.verificationInterval) {
      clearInterval(this.verificationInterval);
    }

    // Green pulse animation
    let pulseCount = 0;
    const maxPulses = 5;
    
    const pulseInterval = setInterval(() => {
      pulseCount++;
      
      this.basePairs.forEach((bp) => {
        // Temporarily change to green
        bp.material.emissive.setHex(0x00ff66);
        bp.material.emissiveIntensity = 1.5;
      });

      setTimeout(() => {
        this.basePairs.forEach((bp) => {
          bp.material.emissive.copy(bp.userData.originalColor);
          bp.material.emissiveIntensity = 0.4;
        });
      }, 200);

      if (pulseCount >= maxPulses) {
        clearInterval(pulseInterval);
      }
    }, 400);

    // Create success particles
    this.createSuccessParticles();
  }

  createSuccessParticles() {
    const particleCount = 100;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const velocities = [];

    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 4;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 4;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 4;

      velocities.push({
        x: (Math.random() - 0.5) * 0.2,
        y: Math.random() * 0.3 + 0.1,
        z: (Math.random() - 0.5) * 0.2
      });
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      size: 0.15,
      color: 0x00ff66,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending
    });

    const successParticles = new THREE.Points(geometry, material);
    this.scene.add(successParticles);

    // Animate success particles
    let frame = 0;
    const maxFrames = 120;

    const animateParticles = () => {
      frame++;
      
      const positions = successParticles.geometry.attributes.position.array;
      
      for (let i = 0; i < particleCount; i++) {
        positions[i * 3] += velocities[i].x;
        positions[i * 3 + 1] += velocities[i].y;
        positions[i * 3 + 2] += velocities[i].z;
        
        // Slow down
        velocities[i].y -= 0.005;
      }
      
      successParticles.geometry.attributes.position.needsUpdate = true;
      successParticles.material.opacity = 1 - (frame / maxFrames);

      if (frame < maxFrames) {
        requestAnimationFrame(animateParticles);
      } else {
        this.scene.remove(successParticles);
        geometry.dispose();
        material.dispose();
      }
    };

    animateParticles();
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    const time = Date.now() * 0.001;

    // Smooth rotation speed transition
    this.currentRotationSpeed += (this.targetRotationSpeed - this.currentRotationSpeed) * 0.05;

    // Rotate DNA
    if (this.dnaGroup) {
      this.dnaGroup.rotation.y += this.currentRotationSpeed;
      
      // Gentle wobble
      this.dnaGroup.rotation.x = Math.sin(time * 0.5) * 0.1;
    }

    // Animate particles
    if (this.particles) {
      this.particles.rotation.y += 0.0005;
      
      const positions = this.particles.geometry.attributes.position.array;
      for (let i = 0; i < positions.length; i += 3) {
        positions[i + 1] += Math.sin(time + i) * 0.002;
      }
      this.particles.geometry.attributes.position.needsUpdate = true;
    }

    // Animate lights
    if (this.lights) {
      this.lights.blueLight.position.x = Math.sin(time) * 10;
      this.lights.blueLight.position.z = Math.cos(time) * 10;
      this.lights.pinkLight.position.x = Math.sin(time + Math.PI) * 10;
      this.lights.pinkLight.position.z = Math.cos(time + Math.PI) * 10;
    }

    // Update controls
    if (this.controls) {
      this.controls.update();
    }

    // Render
    if (this.useComposer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  // Public API
  setGenomeHash(hash) {
    this.options.genomeHash = hash;
    // Rebuild DNA with new colors
    this.scene.remove(this.dnaGroup);
    this.basePairs = [];
    this.backboneSpheres = [];
    this.createDNA();
  }

  getColorPalette() {
    return { ...this.colorPalette };
  }

  getGenomeSequence() {
    const hash = this.options.genomeHash.toLowerCase();
    // Map hex to nucleotides (simplified)
    const nucleotideMap = {
      '0': 'A', '1': 'A', '2': 'A', '3': 'A',
      '4': 'T', '5': 'T', '6': 'T', '7': 'T',
      '8': 'G', '9': 'G', 'a': 'G', 'b': 'G',
      'c': 'C', 'd': 'C', 'e': 'C', 'f': 'C'
    };
    
    return hash.split('').map(c => nucleotideMap[c] || 'N').join('');
  }

  destroy() {
    if (this.verificationInterval) {
      clearInterval(this.verificationInterval);
    }
    
    window.removeEventListener('resize', this.onResize);
    
    // Dispose Three.js resources
    this.scene.traverse((object) => {
      if (object.geometry) object.geometry.dispose();
      if (object.material) {
        if (Array.isArray(object.material)) {
          object.material.forEach(m => m.dispose());
        } else {
          object.material.dispose();
        }
      }
    });
    
    this.renderer.dispose();
    this.container.removeChild(this.renderer.domElement);
  }
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DNAVisualizer;
}
