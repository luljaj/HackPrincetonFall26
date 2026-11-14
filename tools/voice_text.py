"""Text comparison shared by generation checks; normalizes spelling, not meaning."""
import re

def words(text):
    text=text.lower().replace("'",'').replace('firetruck','fire truck')
    return re.findall(r'[a-z0-9]+',text)

def word_error(expected,heard):
    a,b=words(expected),words(heard);row=list(range(len(b)+1))
    for i,x in enumerate(a,1):
        nxt=[i]
        for j,y in enumerate(b,1):nxt.append(min(nxt[-1]+1,row[j]+1,row[j-1]+(x!=y)))
        row=nxt
    return row[-1]/max(1,len(a))
