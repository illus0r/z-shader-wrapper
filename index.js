exports.printMsg = function() {
  console.log("This is a message from the demo package #3");
}

exports.Pass = function Pass({gl, twgl, frag, size = 8, texture }) {
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
  