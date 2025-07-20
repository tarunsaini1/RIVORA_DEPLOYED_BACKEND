<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BreakTest - Learning Platform</title>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/vue/3.3.4/vue.global.prod.min.js"></script>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    }

    body {
      background: #f8f5ff;
      color: #333;
      min-height: 100vh;
    }

    .nav {
      display: flex;
      align-items: center;
      padding: 1rem 2rem;
      background: white;
      box-shadow: 0 2px 4px rgba(0,0,0,0.05);
    }

    .logo {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-weight: 600;
      font-size: 1.25rem;
      color: #6b21a8;
      text-decoration: none;
    }

    .logo img {
      width: 32px;
      height: 32px;
    }

    .nav-links {
      display: flex;
      align-items: center;
      margin-left: auto;
      gap: 2rem;
    }

    .nav-link {
      text-decoration: none;
      color: #666;
      font-weight: 500;
    }

    .nav-link.active {
      color: #6b21a8;
    }

    .avatar {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: #ddd;
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 2rem;
    }

    .breadcrumb {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 2rem;
      color: #666;
    }

    .breadcrumb a {
      color: inherit;
      text-decoration: none;
    }

    .page-title {
      font-size: 1.5rem;
      color: #6b21a8;
      margin-bottom: 2rem;
    }

    .course-card {
      background: white;
      border-radius: 1rem;
      padding: 1.5rem;
      margin-bottom: 1rem;
      transition: all 0.3s ease;
    }

    .course-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1rem;
    }

    .course-title {
      font-size: 1rem;
      font-weight: 500;
    }

    .progress-indicator {
      font-size: 0.875rem;
      color: #666;
    }

    .progress-bar {
      height: 8px;
      background: #f0f0f0;
      border-radius: 4px;
      overflow: hidden;
      margin-bottom: 1rem;
    }

    .progress-segments {
      display: flex;
      height: 100%;
    }

    .segment {
      height: 100%;
    }

    .segment.easy { background: #22c55e; }
    .segment.medium { background: #eab308; }
    .segment.hard { background: #ef4444; }

    .difficulty-labels {
      display: flex;
      justify-content: space-between;
      font-size: 0.75rem;
      color: #666;
    }

    .actions {
      display: flex;
      gap: 1rem;
      margin-top: 1rem;
    }

    .btn {
      padding: 0.5rem 1rem;
      border-radius: 0.5rem;
      font-weight: 500;
      text-decoration: none;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .btn:hover {
      opacity: 0.9;
    }

    .btn-secondary {
      background: white;
      color: #6b21a8;
      border: 1px solid #e5e7eb;
    }

    .btn-primary {
      background: #6b21a8;
      color: white;
      border: none;
    }

    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* Carousel Styles */
    .carousel-container {
      margin-top: 1.5rem;
      position: relative;
      width: 100%;
      padding: 0;
      overflow: hidden;
      height: 450px;
      perspective: 1000px;
    }

    .carousel-wrapper {
      display: flex;
      position: absolute;
      left: 50%;
      transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
      transform-style: preserve-3d;
    }

    /* Base state */
    .level-card {
      background: #f8f5ff;
      border-radius: 1rem;
      padding: 2rem;
      width: 300px;
      text-align: center;
      transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
      flex-shrink: 0;
      position: relative;
      margin: 0 10px;
      opacity: 0.5;
      transform: scale(0.8);
      filter: blur(0.5px);
    }

    /* Modifier states */
    .level-card.prev {
      transform: scale(0.8) translateX(-50%);
      opacity: 0.7;
      z-index: 1;
      filter: blur(0.5px);
    }

    .level-card.next {
      transform: scale(0.8) translateX(50%);
      opacity: 0.7;
      z-index: 1;
      filter: blur(0.5px);
    }

    /* Active state moved to the bottom for highest priority */
    .level-card.active {
      background: #f3e8ff !important;
      transform: scale(1) !important;
      opacity: 1 !important;
      z-index: 2 !important;
      filter: blur(0) !important;
      box-shadow: 0 10px 30px rgba(107,33,168,0.1) !important;
    }

    .level-card.locked {
      opacity: 0.3;
    }

    .level-icon {
      width: 60px;
      height: 60px;
      margin: 0 auto 1rem;
      background: #6b21a8;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 24px;
    }

    .level-title {
      font-size: 1.25rem;
      font-weight: 600;
      margin-bottom: 1rem;
    }

    .level-stats {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1rem;
      margin-bottom: 1rem;
    }

    .stat {
      text-align: center;
    }

    .stat-value {
      font-weight: 600;
      color: #6b21a8;
    }

    .stat-label {
      font-size: 0.75rem;
      color: #666;
    }

    .progress-badge {
      background: #6b21a8;
      color: white;
      padding: 0.5rem 1rem;
      border-radius: 1rem;
      margin-bottom: 1rem;
      display: inline-block;
      font-size: 0.875rem;
    }

    .carousel-nav {
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      width: 40px;
      height: 40px;
      background: white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      border: none;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      z-index: 1;
      transition: all 0.2s ease;
    }

    .carousel-nav:hover {
      background: #f3e8ff;
    }

    .carousel-nav.prev { left: 0; }
    .carousel-nav.next { right: 0; }

    .carousel-nav:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      background: white;
    }

    /* Animation for carousel */
    .carousel-enter-active,
    .carousel-leave-active {
      transition: all 0.3s ease;
      max-height: 1000px;
      opacity: 1;
    }

    .carousel-enter-from,
    .carousel-leave-to {
      max-height: 0;
      opacity: 0;
    }

    @media (max-width: 768px) {
      .container {
        padding: 1rem;
      }

      .nav {
        padding: 1rem;
      }

      .level-card {
        width: 260px;
        padding: 1.5rem;
      }

      .carousel-container {
        padding: 0 40px;
      }

      .actions {
        flex-direction: column;
      }

      .btn {
        width: 100%;
        text-align: center;
      }
    }
  </style>
</head>
<body>
  <div id="app">
    <nav class="nav">
      <a href="#" class="logo">
        <img src="/api/placeholder/32/32" alt="BreakTest Logo" />
        BreakTest
      </a>
      <div class="nav-links">
        <a href="#" class="nav-link">Home</a>
        <a href="#" class="nav-link active">My Courses</a>
        <a href="#" class="nav-link">Results</a>
        <img src="/api/placeholder/32/32" alt="Avatar" class="avatar" />
      </div>
    </nav>

    <main class="container">
      <div class="breadcrumb">
        <a href="#">Home</a>
        •
        <a href="#">Reading & Writing</a>
        •
        <span>Craft & Structure</span>
      </div>

      <h1 class="page-title">My Courses</h1>

      <div class="courses">
        <div v-for="course in courses" :key="course.id" class="course-card">
          <div class="course-header">
            <h2 class="course-title">{{ course.id }}. {{ course.title }}</h2>
            <span class="progress-indicator">{{ course.progress }}%</span>
          </div>

          <div class="progress-bar">
            <div class="progress-segments">
              <div class="segment easy" :style="{ width: '40%' }"></div>
              <div class="segment medium" :style="{ width: '30%' }"></div>
              <div class="segment hard" :style="{ width: '30%' }"></div>
            </div>
          </div>

          <div class="difficulty-labels">
            <span>Easy</span>
            <span>Medium</span>
            <span>Hard</span>
          </div>

          <div class="actions">
            <a href="#" class="btn btn-secondary">Learn More</a>
            <button @click="toggleCarousel(course.id)" class="btn btn-primary">
              {{ course.showingCarousel ? 'Hide Levels' : 'Start Practice' }}
            </button>
          </div>

          <transition name="carousel">
            <div v-if="course.showingCarousel" class="carousel-container">
              <div class="carousel-wrapper" :style="getCarouselStyle()">
                <div v-for="(level, index) in levels" 
                     :key="level.id" 
                     :class="['level-card', { 
                       'active': currentLevel === index,
                       'prev': currentLevel === index + 1,
                       'next': currentLevel === index - 1,
                       'locked': level.locked 
                     }]">
                  <div class="level-icon">{{ level.id }}</div>
                  <h3 class="level-title">Level {{ level.id }}</h3>
                  
                  <div class="progress-badge" v-if="!level.locked">
                    {{ level.completed ? 'Completed' : 'In Progress' }}
                  </div>

                  <div class="level-stats">
                    <div class="stat">
                      <div class="stat-value">{{ level.points }}</div>
                      <div class="stat-label">Points</div>
                    </div>
                    <div class="stat">
                      <div class="stat-value">{{ level.time }}</div>
                      <div class="stat-label">Time Required</div>
                    </div>
                    <div class="stat">
                      <div class="stat-value">{{ level.proficiency }}%</div>
                      <div class="stat-label">Proficiency</div>
                    </div>
                  </div>

                  <div class="actions">
                    <button class="btn btn-secondary">Learn More</button>
                    <button class="btn btn-primary" :disabled="level.locked && currentLevel !== index">
                      {{ level.completed ? 'Start over' : 'Start Practice' }}
                    </button>
                  </div>
                </div>
              </div>

              <button class="carousel-nav prev" @click="prevLevel" :disabled="currentLevel === 0">
                ←
              </button>
              <button class="carousel-nav next" @click="nextLevel" :disabled="currentLevel === levels.length - 1">
                →
              </button>
            </div>
          </transition>
        </div>
      </div>
    </main>
  </div>

  <script>
    const { createApp } = Vue

    createApp({
      data() {
        return {
          courses: [
            { id: 1, title: 'Cross Text Connection', progress: 34, showingCarousel: false },
            { id: 2, title: 'Cross Text Connection', progress: 34, showingCarousel: false },
            { id: 3, title: 'Words in Context', progress: 34, showingCarousel: false }
          ],
          currentLevel: 0,
          levels: [
            { 
              id: 1, 
              points: 40, 
              time: '4hrs', 
              proficiency: 100,
              completed: true,
              locked: false
            },
            { 
              id: 2, 
              points: 60, 
              time: '6hrs', 
              proficiency: 0,
              completed: false,
              locked: true
            },
            { 
              id: 3, 
              points: 80, 
              time: '8hrs', 
              proficiency: 0,
              completed: false,
              locked: true
            }
          ]
        }
      },
      methods: {
        toggleCarousel(courseId) {
          this.courses = this.courses.map(course => ({
            ...course,
            showingCarousel: course.id === courseId ? !course.showingCarousel : false
          }))
          this.currentLevel = 0
        },
        prevLevel() {
          if (this.currentLevel > 0) {
            this.currentLevel--
          }
        },
        nextLevel() {
          if (this.currentLevel < this.levels.length - 1) {
            this.currentLevel++
          }
        },
       getCarouselStyle() {
              const cardWidth = 340; // Width of card + margin
              const totalCards = this.levels.length;
              // Center offset moves the whole carousel so that card 0 is centered initially.
              const centerOffset = ((totalCards - 1) * cardWidth) / 2;
              const slideOffset = -this.currentLevel * cardWidth;
              return {
                transform: `translateX(calc(-50% + ${centerOffset + slideOffset}px))`
              }
            }
      }
    }).mount('#app')
  </script>
</body>
</html>