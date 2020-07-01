Pointrel-like ideas inspired a bit by "Foam"
https://news.ycombinator.com/item?id=23666950
https://github.com/foambubble/foam

triple: this tag start  
@ this tag start

Implicit above is:  
@ this link https://news.ycombinator.com/item?id=23666950  
@ this link https://github.com/foambubble/foam  

Simpler:

@tag start  
@tag: start  

@link https://github.com/foambubble/foam

Or to make new page:  
@link NewPage.md

Click here to go to [AnotherPage yes really](AnotherPage.md)

Click here to go to [AnotherPage also for realz](AnotherPage.md)

What if URL looked like: ?
/twirlip15/view-md/home/pdfernhout/workspace/Twirlip15/client/ideas/AnotherPage.md

Or:
/localhost/view-md/home/pdfernhout/workspace/Twirlip15/client/ideas/AnotherPage.md
/localhost/files/home/pdfernhout/workspace/Twirlip15/client/ideas/AnotherPage.md

--

Maybe better if @ works where if no space is full triple and if space it refers to self?  
@test1 tag test-tag  
@ tag test-tag  

so can explicitly define triples in a file
or can also implicitly define triples via links in markdown file

-----

What if use base URL as from root and then add querystring with app vs. putting app in path early on. So:

http://localhost/home/pdfernhout/workspace/Twirlip15/client/ideas/AnotherPage.md?twirlip=view-md

http://localhost/home/pdfernhout/workspace/Twirlip15/?twirlip=filer
