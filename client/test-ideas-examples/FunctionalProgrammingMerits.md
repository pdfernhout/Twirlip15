Realizing how much simpler programming can be have JSON (with type/class field) and operate on it Lisp-like functionally vs. using Smalltalk-like objects which are opaque.

Things look messier in Browser inspector when prototypes and methods come into play. Thinking this when inspecting Cytoscape node objects in browser and seeing clutter...

Maybe often best if "class" (or "type") is an annotation on a JSON object and then functions can be dispatched on that as needed? Could there be better support for that as a special "meta" field in JSON? So the class name is out-of-band?

Opaqueness of state has pros and cons.

Or maybe the Smalltalk object inspector is just better than the Browser inspector?
