Triple-encoding

From: https://en.wikipedia.org/wiki/JSON-LD

```
{
  "@context": {
    "name": "http://xmlns.com/foaf/0.1/name",
    "homepage": {
      "@id": "http://xmlns.com/foaf/0.1/workplaceHomepage",
      "@type": "@id"
    },
    "Person": "http://xmlns.com/foaf/0.1/Person"
  },
  "@id": "https://me.example.com",
  "@type": "Person",
  "name": "John Smith",
  "homepage": "https://www.example.com/"
}
```

How could that look as text-line triples?

```
@context 
    name http://xmlns.com/foaf/0.1/name
    homepage 
        @id http://xmlns.com/foaf/0.1/workplaceHomepage
        @type @id
    Person http://xmlns.com/foaf/0.1/Person
@id https://me.example.com
@type Person
name John Smith
homepage https://www.example.com/
```

Implicit object?

More like:

```
uuid-d568-hjd0-32kj
    @id https://me.example.com
    @type Person
    name John Smith
    homepage https://www.example.com/
```

Or perhaps also:

```
uuid-d568-hjd0-32kj @id https://me.example.com
    @type Person
    name John Smith
    homepage https://www.example.com/
```

Where third item (value) can contain spaces but first two can't. Maybe first two could be optionally quoted if have spaces? Or escaped spaces?

Or with context:

```
uuid-d568-hjd0-32kj @id https://me.example.com
    @type Person
    name John Smith
    homepage https://www.example.com/

meta:uuid-d568-hjd0-32kj 
    name http://xmlns.com/foaf/0.1/name
    Person http://xmlns.com/foaf/0.1/Person
    homepage 
        @id http://xmlns.com/foaf/0.1/workplaceHomepage
        @type @id
 ```
   
Or maybe implicit nested objects? But need explicit UUIDs for consistency?

Simpler:

```
meta:uuid-d568-hjd0-32kj 
    name http://xmlns.com/foaf/0.1/name
    Person http://xmlns.com/foaf/0.1/Person
    homepage http://xmlns.com/foaf/0.1/workplaceHomepage
```

Or different overall:

```
https://me.example.com
    @type Person
    name John Smith
    homepage https://www.example.com/
```

