exports.zShader = function () {
    'use strict';

    let twgl = require('twgl.js')
    let chroma = require('chroma-js');
    const { random } = require('chroma-js');

    // Palette
    let palette = ['#230f2b', '#f21d41', '#ebebbc', '#bce3c5', '#82b3ae']
    palette = palette.map(c => chroma(c).gl())
    palette = palette.sort((a, b) => chroma(a).get('lch.l') - chroma(b).get('lch.l'))

    // WebGL
    const canvas = document.getElementById('canvasgl')
    const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true })
    gl.getExtension('EXT_color_buffer_float'); // prevents Buffer Incomplete error
    gl.getExtension('OES_texture_float_linear');

    let passes

    // Scene
    let voxelsNum = 128
    let segments, relief


    function prepare2dSegmentsMap() {
        relief = [...Array(voxelsNum)].map((d) => [...Array(voxelsNum)].map((d) => Math.random()));
        segments = [...Array(voxelsNum)].map((d) => [...Array(voxelsNum)].fill(0));

        function getRelief(i, j) {
            i = (i + voxelsNum) % voxelsNum;
            j = (j + voxelsNum) % voxelsNum;
            return relief[i][j];
        }

        for (let x = 0; x < voxelsNum; x++) {
            for (let y = 0; y < voxelsNum; y++) {
                let S = 3;
                let minVal = Infinity;
                let idx = x;
                let idy = y;
                for (let step = 0; step < 3; step++) {
                    let imin = 0
                    let jmin = 0
                    for (let i = -S; i <= S; i++) {
                        for (let j = -S; j <= S; j++) {
                            if (Math.hypot(i, j) > S) continue;
                            let r = getRelief(idx + i, idy + j);
                            if (r < minVal) {
                                minVal = r;
                                imin = i;
                                jmin = j;
                            }
                        }
                    }
                    idx += imin
                    idy += jmin
                }

                segments[x][y] = minVal * 1e3 - Math.floor(minVal * 1e3);
            }
        }
        console.log("segments, relief", segments, relief);
    }

    let rnd = (x) => {
        let s = x * 9e4
        return s - Math.floor(s)
    }
    function prepareTexVoxels() {
        // fill 3d array N×N×N filled with rgba(0,0,0,0)
        let texVoxelsArray = [...Array(voxelsNum)].map(() => [...Array(voxelsNum)].map(() => [...Array(voxelsNum)].map(_ => [0, 0, 0, 0])))

        prepare2dSegmentsMap()

        for (let x = 1; x < voxelsNum; x++) {
            for (let z = 1; z < voxelsNum; z++) {
                let id = segments[x][z]
                let height = -63;
                if (id == segments[x - 1][z] && id == segments[x][z - 1] && id == segments[x - 1][z - 1])
                    height = 4 + 8 * rnd(id);
                for (let y = 0; y < 64 + height; y++) {
                    texVoxelsArray[x][y][z] = [id, 0, 0, 0].map(d => d * 255)
                }
            }
        }

        // texVoxelsArray[zz][yy][xx] = [xx*2,yy*2,zz*2,1]
        console.log('texVoxelsArray', texVoxelsArray)

        let texVoxels = twgl.createTexture(gl, {
            src: texVoxelsArray.flat(3),
            width: texVoxelsArray[0].length,
            mag: gl.NEAREST,
            min: gl.NEAREST,
        });

        return texVoxels
    }

    let texVoxels = prepareTexVoxels()

    exports.Pass = function Pass({ gl, twgl, frag, size = 8, texture }) {
        if (size.length)
            this.resolution = size
        else
            this.resolution = [size, size]

        // console.log(this.resolution)
        this.vert = `#version 300 es
        precision mediump float;
        in vec2 position;
        void main() {
          gl_Position = vec4(position, 0.0, 1.0);
        }`
        this.frag = frag
        this.program = twgl.createProgramInfo(gl, [this.vert, this.frag])
        this.attachments = [{ internalFormat: gl.RGBA32F }]

        this.buffer = twgl.createFramebufferInfo(gl, this.attachments, ...this.resolution)
        this.backbuffer = twgl.createFramebufferInfo(gl, this.attachments, ...this.resolution)

        this.b = this.backbuffer.attachments[0]
        // while(gl.checkFramebufferStatus(gl.FRAMEBUFFER) != gl.FRAMEBUFFER_COMPLETE){
        //   console.log(gl.checkFramebufferStatus(gl.FRAMEBUFFER), gl.FRAMEBUFFER_COMPLETE, gl.FRAMEBUFFER_INCOMPLETE_ATTACHMENT)
        // }

        this.positionObject = { position: { data: [1, 1, 1, -1, -1, -1, -1, 1], numComponents: 2 } }
        this.positionBuffer = twgl.createBufferInfoFromArrays(gl, this.positionObject)

        this.texture = texture
        // console.log('texture', texture)

        this.draw = ({ uniforms, target }) => {
            // target: self, screen, self+screen
            gl.useProgram(this.program.program)
            twgl.setBuffersAndAttributes(gl, this.program, this.positionBuffer)

            if (!uniforms.u_resolution) uniforms.u_resolution = this.resolution
            if (target != 'screen') // self or both
                uniforms.backbuffer = this.backbuffer.attachments[0]
            if (this.texture)
                uniforms.texture = this.texture
            twgl.setUniforms(this.program, uniforms)

            if (target != 'self') { // screen or both
                twgl.bindFramebufferInfo(gl, null)
                twgl.drawBufferInfo(gl, this.positionBuffer, gl.TRIANGLE_FAN)
            }
            if (target != 'screen') { // self or both
                twgl.bindFramebufferInfo(gl, this.buffer)
                let tmp = this.buffer
                this.buffer = this.backbuffer
                this.backbuffer = tmp
                this.b = this.backbuffer.attachments[0]
                twgl.drawBufferInfo(gl, this.positionBuffer, gl.TRIANGLE_FAN)
            }
        }
    }


    let tick = 0

    let dt;
    let prevTime;



    twgl.resizeCanvasToDisplaySize(gl.canvas);
    passes = {
        gi: new Pass({
            gl,
            twgl,
            frag: require('./gi.frag'),
            size: [canvas.width, canvas.height],
        }),
        draw: new Pass({
            gl,
            twgl,
            frag: require('./draw.frag'),
        }),
    }

    let params = [...Array(10)].map(() => Math.random())

    let timeI = new Date() / 1000

    function draw() {
        let time = new Date() / 1000
        twgl.resizeCanvasToDisplaySize(gl.canvas);
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
        dt = (prevTime) ? time - prevTime : 0;
        prevTime = time;

        passes.gi.draw({
            uniforms: {
                u_frame: tick,
                tex: passes.gi.b,
                u_time: time - timeI,
                u_params: params,
                u_tex_voxels: texVoxels,
                u_voxels_num: voxelsNum,
            },
            target: 'self',
        })
        // console.log(time - timeI)
        passes.draw.draw({
            uniforms: {
                tex: passes.gi.b,
                u_resolution: [canvas.width, canvas.height],
            },
            target: 'screen',
        })

        tick++
        console.log(tick)
        if (tick < 3)
            requestAnimationFrame(draw)
    }

    draw()

    window.addEventListener('resize', (e) => {
        resize()
    })

    function resize() {
        let w = window.innerWidth * window.devicePixelRatio
        let h = window.innerHeight * window.devicePixelRatio
        twgl.resizeFramebufferInfo(gl, passes.gi.buffer, passes.gi.attachments, w, h)
        twgl.resizeFramebufferInfo(gl, passes.gi.backbuffer, passes.gi.attachments, w, h)
        passes.gi.resolution = [w, h]
    }
    resize()
}




exports.printMsg = function () {
    console.log("This is a message from the demo package #5");
}