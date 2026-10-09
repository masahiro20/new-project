; Sample: a TyranoScript scenario (invented content). English translation. Drifts are deliberate.
[chara_new name=lisette jname=Lisette storage=lisette.png]
*start|In the Archive
[bg storage=archive.jpg time=500]
The Ashen Archive was thick with the smell of old paper.[p]

#Lisette
Welcome.[l][r]
I am Lisette, keeper of the archive.[p]

#Mina:happy
I've never seen a Magic Stone before![p]

#Tobias
I'm with the Order of Dawn.[l]
I'll take you to the Rune Gate.[p]

[iscript]
f.visited = true;
[endscript]

*stacks|The Back Stacks
#Mina
Are the Stargazer records kept back here?[p]

#Lisette
Yes. Please do not touch the [font color=0xff0000]forbidden books.[p]

#
The two of them went deeper into the stacks.[p]

*choice|The Fork
[glink text="Follow her" target=*follow]
[glink text="Wait here" target=*wait]
[s]
