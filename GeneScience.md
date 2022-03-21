## GeneScience Contract

Responsible for the genetic and attributes algorithm of the NFTs. We use a Base32 Notation (Kai Notation)


|Kai|Binary |Num|Kai|Binary |Num|Kai|Binary |Num|Kai|Binary |Num|
|---|-------|---|---|-------|---|---|-------|---|---|-------|---|
| 1 | 00000 | 0 | 9 | 01000 | 8 | h | 10000 |16 | q | 11000 |24 |
| 2 | 00001 | 1 | a | 01001 | 9 | i | 10001 |17 | r | 11001 |25 |
| 3 | 00010 | 2 | b | 01010 | 10| j | 10010 |18 | s | 11010 |26 |
| 4 | 00011 | 3 | c | 01011 | 11| k | 10011 |19 | t | 11011 |27 |
| 5 | 00100 | 4 | d | 01100 | 12| m | 10100 |20 | u | 11100 |28 |
| 6 | 00101 | 5 | e | 01101 | 13| n | 10101 |21 | v | 11101 |29 |
| 7 | 00110 | 6 | f | 01110 | 14| o | 10110 |22 | w | 11110 |30 |
| 8 | 00111 | 7 | g | 01111 | 15| p | 10111 |23 | x | 11111 |31 |


# Sumo genome

An NFT gnome has 48 genes, and every 4bit chunk is a trait(hair type, hair style, eyes, mouth, mawashi), known as the dominant (d), 1st recessive (r1), 2nd recessive (r2), and 3rd recessive (r3) gene, resulting in 12 trait groups of 4 genes, 

```44h9 8oe2 5543 v741 7d12 1de6 aa82 7832 1i56 434p 7234 5266```


Let say we map these traits as hair(0-3), body type(4-7), eyes(8-11), mouth(12-15) and mawashi(16-19); and we have these mapping for the hair:


|Kai| Code |  Name   | Rarity |
|---|------|---------|--------|
| 1 | HR00 | hair 1  |   N    |
| 2 | HR01 | hair 2  |   N    |
| 3 | HR02 | hair 3  |   N    |
| 4 | HR03 | hair 4  |   N    |
| 5 | HR04 | hair 5  |   N    |
| 6 | HR05 | hair 6  |   N    |
| 7 | HR06 | hair 7  |   N    |
| 8 | HR07 | hair 8  |   N    |
| 9 | HR08 | hair 9  |   N    |
| a | HR09 | hair 10 |   N    |
| b | HR10 | hair 11 |   N    |
| c | HR11 | hair 12 |   N    |
| d | HR12 | hair 13 |   N    |
| e | HR13 | hair 14 |   N    |
| f | HR14 | hair 15 |   N    |
| g | HR15 | hair 16 |   N    |
| h | HR16 | hair 17 |   R    |
| i | HR17 | hair 18 |   R    |
| j | HR18 | hair 19 |   R    |
| k | HR19 | hair 20 |   R    |
| l | HR20 | hair 21 |   R    |
| m | HR21 | hair 22 |   R    |
| n | HR22 | hair 23 |   R    |
| o | HR23 | hair 24 |   R    |
| p | HR24 | hair 25 |   SR   |
| q | HR25 | hair 26 |   SR   |
| r | HR26 | hair 27 |   SR   |
| s | HR27 | hair 28 |   SR   |
| t | HR28 | hair 29 |   SR   |
| u | HR29 | hair 30 |   SSR  |
| v | HR30 | hair 31 |   SSR  |
| w | HR31 | hair 32 |   UR   |

# Hair (0-3)
|Kai| Gene |  Trait   | Rarity |         |
|---|------|----------|--------|---------|
| 4 |    0 | hair 4   | N      | visible |
| 4 |    1 | hair 4   | N      | hidden  |
| h |    2 | hair 17  | R      | hidden  |
| 9 |    3 | hair 9   | N      | hidden  |


> Note: Only visible/dominant traits are the ones that we render in the frontend, but the hidden/recessive traits also contribute for the overall push power and fusion computations.
